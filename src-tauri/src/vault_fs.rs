//! File operations inside an open vault. Every path goes through
//! `path_guard::resolve`. There is deliberately no delete operation.

use std::fs;
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::UNIX_EPOCH;

use serde::Serialize;

use crate::error::{ErrorKind, VaultError, VaultResult};
use crate::path_guard::{normalise, resolve};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    /// Vault-relative path with `/` separators.
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    /// Milliseconds since the Unix epoch, if the OS reports it.
    pub modified: Option<u64>,
}

fn join_rel(dir: &str, name: &str) -> String {
    if dir.is_empty() {
        name.to_string()
    } else {
        format!("{dir}/{name}")
    }
}

pub fn list_dir(root: &Path, rel: &str) -> VaultResult<Vec<DirEntry>> {
    let dir_rel = normalise(rel)?;
    let dir = resolve(root, &dir_rel)?;
    let meta = fs::metadata(&dir).map_err(|e| VaultError::io("Cannot open folder", &e))?;
    if !meta.is_dir() {
        return Err(VaultError::new(
            ErrorKind::NotADirectory,
            format!("'{dir_rel}' is not a folder"),
        ));
    }

    let mut entries = Vec::new();
    for item in fs::read_dir(&dir).map_err(|e| VaultError::io("Cannot list folder", &e))? {
        let item = item.map_err(|e| VaultError::io("Cannot list folder", &e))?;
        // Names that are not UTF-8 or break the path rules could not be
        // opened again, so they are left out of the listing.
        let Ok(name) = item.file_name().into_string() else {
            continue;
        };
        let path = join_rel(&dir_rel, &name);
        if normalise(&path).is_err() {
            continue;
        }
        // Follow symlinks for type and size; a broken link shows as an empty file.
        let meta = fs::metadata(item.path()).ok();
        entries.push(DirEntry {
            name,
            path,
            is_dir: meta.as_ref().is_some_and(|m| m.is_dir()),
            size: meta
                .as_ref()
                .map_or(0, |m| if m.is_dir() { 0 } else { m.len() }),
            modified: meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64),
        });
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

pub fn read_text(root: &Path, rel: &str) -> VaultResult<String> {
    let path = resolve(root, rel)?;
    let meta = fs::metadata(&path).map_err(|e| VaultError::io("Cannot read file", &e))?;
    if meta.is_dir() {
        return Err(VaultError::new(
            ErrorKind::NotAFile,
            format!("'{rel}' is a folder"),
        ));
    }
    fs::read_to_string(&path).map_err(|e| VaultError::io("Cannot read file", &e))
}

pub fn write_text_atomic(root: &Path, rel: &str, text: &str) -> VaultResult<()> {
    let normal = normalise(rel)?;
    if normal.is_empty() {
        return Err(VaultError::new(
            ErrorKind::NotAFile,
            "The vault root is a folder",
        ));
    }
    let path = resolve(root, &normal)?;
    write_atomic(&path, text)
}

/// Writes to a temporary file beside the target, flushes it, then renames it
/// over the target, so a crash never leaves a half-written file.
pub fn write_atomic(path: &Path, text: &str) -> VaultResult<()> {
    static COUNTER: AtomicU64 = AtomicU64::new(0);

    let parent = path
        .parent()
        .ok_or_else(|| VaultError::new(ErrorKind::InvalidPath, "Path has no parent folder"))?;
    match fs::metadata(parent) {
        Ok(m) if m.is_dir() => {}
        Ok(_) => {
            return Err(VaultError::new(
                ErrorKind::NotADirectory,
                "The parent of this path is a file",
            ))
        }
        Err(e) => return Err(VaultError::io("Parent folder does not exist", &e)),
    }
    if path.is_dir() {
        return Err(VaultError::new(
            ErrorKind::NotAFile,
            "Cannot write over a folder",
        ));
    }

    let name = path.file_name().unwrap_or_default().to_string_lossy();
    let tmp = parent.join(format!(
        ".{name}.{}.{}.tmp",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    ));
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        drop(file);
        fs::rename(&tmp, path)
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&tmp);
        return Err(VaultError::io("Cannot write file", &e));
    }
    Ok(())
}

pub fn ensure_dir(root: &Path, rel: &str) -> VaultResult<()> {
    let path = resolve(root, rel)?;
    match fs::metadata(&path) {
        Ok(m) if m.is_dir() => return Ok(()),
        Ok(_) => {
            return Err(VaultError::new(
                ErrorKind::NotADirectory,
                format!("'{rel}' is a file"),
            ))
        }
        Err(_) => {}
    }
    fs::create_dir_all(&path).map_err(|e| VaultError::io("Cannot create folder", &e))
}

pub fn exists(root: &Path, rel: &str) -> VaultResult<bool> {
    let path = resolve(root, rel)?;
    Ok(fs::symlink_metadata(path).is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path_guard::canonical_root;

    fn vault() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = canonical_root(dir.path()).unwrap();
        (dir, root)
    }

    #[test]
    fn write_then_read_round_trips() {
        let (_d, root) = vault();
        write_text_atomic(&root, "page.md", "Hello, été").unwrap();
        assert_eq!(read_text(&root, "page.md").unwrap(), "Hello, été");
        write_text_atomic(&root, "page.md", "Replaced").unwrap();
        assert_eq!(read_text(&root, "page.md").unwrap(), "Replaced");
    }

    #[test]
    fn atomic_write_leaves_no_temp_files() {
        let (_d, root) = vault();
        write_text_atomic(&root, "a.md", "one").unwrap();
        write_text_atomic(&root, "a.md", "two").unwrap();
        let names: Vec<_> = list_dir(&root, "")
            .unwrap()
            .into_iter()
            .map(|e| e.name)
            .collect();
        assert_eq!(names, vec!["a.md"]);
    }

    #[test]
    fn write_needs_an_existing_parent_folder() {
        let (_d, root) = vault();
        let err = write_text_atomic(&root, "missing/page.md", "x").unwrap_err();
        assert_eq!(err.kind, ErrorKind::NotFound);
        ensure_dir(&root, "missing").unwrap();
        write_text_atomic(&root, "missing/page.md", "x").unwrap();
    }

    #[test]
    fn write_refuses_folders_and_root() {
        let (_d, root) = vault();
        ensure_dir(&root, "Notes").unwrap();
        assert_eq!(
            write_text_atomic(&root, "Notes", "x").unwrap_err().kind,
            ErrorKind::NotAFile
        );
        assert_eq!(
            write_text_atomic(&root, "", "x").unwrap_err().kind,
            ErrorKind::NotAFile
        );
    }

    #[test]
    fn list_dir_reports_entries_with_relative_paths() {
        let (_d, root) = vault();
        ensure_dir(&root, "Notes/Week 1").unwrap();
        write_text_atomic(&root, "Notes/b.md", "12345").unwrap();
        write_text_atomic(&root, "Notes/a.md", "").unwrap();

        let entries = list_dir(&root, "Notes").unwrap();
        let summary: Vec<_> = entries
            .iter()
            .map(|e| (e.name.as_str(), e.path.as_str(), e.is_dir, e.size))
            .collect();
        assert_eq!(
            summary,
            vec![
                ("Week 1", "Notes/Week 1", true, 0),
                ("a.md", "Notes/a.md", false, 0),
                ("b.md", "Notes/b.md", false, 5),
            ]
        );
        assert!(entries.iter().all(|e| e.modified.is_some()));
    }

    #[test]
    fn list_dir_and_read_report_wrong_types() {
        let (_d, root) = vault();
        write_text_atomic(&root, "page.md", "x").unwrap();
        ensure_dir(&root, "Notes").unwrap();
        assert_eq!(
            list_dir(&root, "page.md").unwrap_err().kind,
            ErrorKind::NotADirectory
        );
        assert_eq!(
            read_text(&root, "Notes").unwrap_err().kind,
            ErrorKind::NotAFile
        );
        assert_eq!(
            read_text(&root, "missing.md").unwrap_err().kind,
            ErrorKind::NotFound
        );
        assert_eq!(
            ensure_dir(&root, "page.md").unwrap_err().kind,
            ErrorKind::NotADirectory
        );
    }

    #[test]
    fn exists_reports_files_and_folders() {
        let (_d, root) = vault();
        assert!(exists(&root, "").unwrap());
        assert!(!exists(&root, ".benchwork").unwrap());
        ensure_dir(&root, ".benchwork").unwrap();
        assert!(exists(&root, ".benchwork").unwrap());
    }

    #[test]
    fn every_operation_rejects_escapes() {
        let (_d, root) = vault();
        for rel in ["../x.md", "a/../../x.md"] {
            assert_eq!(
                list_dir(&root, rel).unwrap_err().kind,
                ErrorKind::OutsideVault
            );
            assert_eq!(
                read_text(&root, rel).unwrap_err().kind,
                ErrorKind::OutsideVault
            );
            assert_eq!(
                write_text_atomic(&root, rel, "x").unwrap_err().kind,
                ErrorKind::OutsideVault
            );
            assert_eq!(
                ensure_dir(&root, rel).unwrap_err().kind,
                ErrorKind::OutsideVault
            );
            assert_eq!(
                exists(&root, rel).unwrap_err().kind,
                ErrorKind::OutsideVault
            );
        }
    }
}
