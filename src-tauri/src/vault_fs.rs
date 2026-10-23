//! File operations inside an open vault. Every path goes through
//! `path_guard::resolve`. There is deliberately no delete operation for
//! user files: only `remove_snapshot`, for BenchWork's own snapshot files.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
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

/// Reads a whole file as bytes, for previews. Refuses files over `max_bytes`.
pub fn read_bytes(root: &Path, rel: &str, max_bytes: u64) -> VaultResult<Vec<u8>> {
    let path = resolve(root, rel)?;
    let meta = fs::metadata(&path).map_err(|e| VaultError::io("Cannot read file", &e))?;
    if meta.is_dir() {
        return Err(VaultError::new(
            ErrorKind::NotAFile,
            format!("'{rel}' is a folder"),
        ));
    }
    if meta.len() > max_bytes {
        return Err(VaultError::new(
            ErrorKind::TooLarge,
            format!(
                "The file is {} bytes, over the limit of {max_bytes}",
                meta.len()
            ),
        ));
    }
    fs::read(&path).map_err(|e| VaultError::io("Cannot read file", &e))
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
    write_atomic(&path, text.as_bytes())
}

pub fn write_bytes_atomic(root: &Path, rel: &str, data: &[u8]) -> VaultResult<()> {
    let normal = normalise(rel)?;
    if normal.is_empty() {
        return Err(VaultError::new(
            ErrorKind::NotAFile,
            "The vault root is a folder",
        ));
    }
    let path = resolve(root, &normal)?;
    write_atomic(&path, data)
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

/// A temporary file name beside `path`, hidden and unique to this process.
fn temp_beside(path: &Path) -> VaultResult<PathBuf> {
    let parent = path
        .parent()
        .ok_or_else(|| VaultError::new(ErrorKind::InvalidPath, "Path has no parent folder"))?;
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    Ok(parent.join(format!(
        ".{name}.{}.{}.tmp",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    )))
}

/// Writes to a temporary file beside the target, flushes it, then renames it
/// over the target, so a crash never leaves a half-written file.
pub fn write_atomic(path: &Path, data: &[u8]) -> VaultResult<()> {
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

    let tmp = temp_beside(path)?;
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(data)?;
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

fn require_parent_dir(path: &Path) -> VaultResult<()> {
    let parent = path
        .parent()
        .ok_or_else(|| VaultError::new(ErrorKind::InvalidPath, "Path has no parent folder"))?;
    match fs::metadata(parent) {
        Ok(m) if m.is_dir() => Ok(()),
        Ok(_) => Err(VaultError::new(
            ErrorKind::NotADirectory,
            "The parent of this path is a file",
        )),
        Err(e) => Err(VaultError::io("Parent folder does not exist", &e)),
    }
}

fn already_exists(rel: &str) -> VaultError {
    VaultError::new(ErrorKind::AlreadyExists, format!("'{rel}' already exists"))
}

/// Creates a file with `text`, failing if anything is already at `rel`.
/// Used for new pages, so an existing page is never overwritten.
pub fn create_new(root: &Path, rel: &str, text: &str) -> VaultResult<()> {
    let normal = normalise(rel)?;
    if normal.is_empty() {
        return Err(already_exists(rel));
    }
    let path = resolve(root, &normal)?;
    require_parent_dir(&path)?;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                already_exists(&normal)
            } else {
                VaultError::io("Cannot create file", &e)
            }
        })?;
    file.write_all(text.as_bytes())
        .and_then(|()| file.sync_all())
        .map_err(|e| VaultError::io("Cannot write file", &e))
}

/// True when two paths name the same file, such as `page.md` and `Page.md`
/// on Windows, where names are not case-sensitive.
fn same_file(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(x), Ok(y)) => x == y,
        _ => false,
    }
}

/// Renames or moves a file or folder within the vault. Fails if `to` already
/// exists, except for a change of case only. A folder cannot move into itself.
pub fn rename(root: &Path, from: &str, to: &str) -> VaultResult<()> {
    let from_rel = normalise(from)?;
    let to_rel = normalise(to)?;
    if from_rel.is_empty() || to_rel.is_empty() {
        return Err(VaultError::new(
            ErrorKind::InvalidPath,
            "The vault itself cannot be renamed",
        ));
    }
    if to_rel.starts_with(&format!("{from_rel}/")) {
        return Err(VaultError::new(
            ErrorKind::InvalidPath,
            "A folder cannot be moved inside itself",
        ));
    }
    let src = resolve(root, &from_rel)?;
    let dest = resolve(root, &to_rel)?;
    fs::symlink_metadata(&src).map_err(|e| VaultError::io("Cannot rename", &e))?;
    require_parent_dir(&dest)?;
    if fs::symlink_metadata(&dest).is_ok() && !same_file(&src, &dest) {
        return Err(already_exists(&to_rel));
    }
    fs::rename(&src, &dest).map_err(|e| VaultError::io("Cannot rename", &e))
}

/// Copies a file from outside the vault (one the user dragged in) to `to`.
/// Fails if `to` exists, or if the file is larger than `max_bytes`.
/// Returns the number of bytes copied.
pub fn copy_in(root: &Path, external: &Path, to: &str, max_bytes: u64) -> VaultResult<u64> {
    let meta = fs::metadata(external).map_err(|e| VaultError::io("Cannot read file", &e))?;
    if !meta.is_file() {
        return Err(VaultError::new(
            ErrorKind::NotAFile,
            "Only files can be added",
        ));
    }
    if meta.len() > max_bytes {
        return Err(VaultError::new(
            ErrorKind::TooLarge,
            format!(
                "The file is {} bytes, over the limit of {max_bytes}",
                meta.len()
            ),
        ));
    }
    let to_rel = normalise(to)?;
    let dest = resolve(root, &to_rel)?;
    require_parent_dir(&dest)?;
    if fs::symlink_metadata(&dest).is_ok() {
        return Err(already_exists(&to_rel));
    }
    let tmp = temp_beside(&dest)?;
    let copied = fs::copy(external, &tmp).and_then(|n| {
        fs::OpenOptions::new().write(true).open(&tmp)?.sync_all()?;
        Ok(n)
    });
    let result = copied.and_then(|n| {
        // Re-check just before the rename, so a file that appeared meanwhile is not replaced.
        if fs::symlink_metadata(&dest).is_ok() {
            return Err(std::io::Error::from(std::io::ErrorKind::AlreadyExists));
        }
        fs::rename(&tmp, &dest).map(|()| n)
    });
    result.map_err(|e| {
        let _ = fs::remove_file(&tmp);
        if e.kind() == std::io::ErrorKind::AlreadyExists {
            already_exists(&to_rel)
        } else {
            VaultError::io("Cannot copy file", &e)
        }
    })
}

/// Moves a file or folder to the operating system's Recycle Bin. Nothing in
/// BenchWork deletes permanently.
pub fn trash(root: &Path, rel: &str) -> VaultResult<()> {
    let normal = normalise(rel)?;
    if normal.is_empty() {
        return Err(VaultError::new(
            ErrorKind::InvalidPath,
            "The vault itself cannot be moved to the Recycle Bin",
        ));
    }
    let path = resolve(root, &normal)?;
    fs::symlink_metadata(&path).map_err(|e| VaultError::io("Cannot find item", &e))?;
    trash::delete(&path).map_err(|e| {
        VaultError::new(
            ErrorKind::Io,
            format!("Cannot move to the Recycle Bin: {e}"),
        )
    })
}

pub fn exists(root: &Path, rel: &str) -> VaultResult<bool> {
    let path = resolve(root, rel)?;
    Ok(fs::symlink_metadata(path).is_ok())
}

/// Where BenchWork keeps its recovery copies of pages.
pub const SNAPSHOT_DIR: &str = ".benchwork/snapshots";

/// Deletes one of BenchWork's own snapshot files, for keeping only recent
/// ones. The only delete there is: it refuses anything that is not a file
/// inside `.benchwork/snapshots/`, so it can never reach a user's files.
pub fn remove_snapshot(root: &Path, rel: &str) -> VaultResult<()> {
    let normal = normalise(rel)?;
    let inside = normal
        .strip_prefix(SNAPSHOT_DIR)
        .is_some_and(|rest| rest.starts_with('/') && rest.len() > 1);
    if !inside {
        return Err(VaultError::new(
            ErrorKind::InvalidPath,
            format!("'{normal}' is not a snapshot"),
        ));
    }
    let path = resolve(root, &normal)?;
    let meta =
        fs::symlink_metadata(&path).map_err(|e| VaultError::io("Cannot find snapshot", &e))?;
    if !meta.is_file() {
        return Err(VaultError::new(
            ErrorKind::NotAFile,
            format!("'{normal}' is not a file"),
        ));
    }
    fs::remove_file(&path).map_err(|e| VaultError::io("Cannot remove snapshot", &e))
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

#[cfg(test)]
mod phase1_tests {
    use super::*;
    use crate::path_guard::canonical_root;

    fn vault() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = canonical_root(dir.path()).unwrap();
        (dir, root)
    }

    #[test]
    fn create_new_never_overwrites() {
        let (_d, root) = vault();
        create_new(&root, "Page.md", "first").unwrap();
        assert_eq!(
            create_new(&root, "Page.md", "second").unwrap_err().kind,
            ErrorKind::AlreadyExists
        );
        assert_eq!(read_text(&root, "Page.md").unwrap(), "first");
        assert_eq!(
            create_new(&root, "missing/Page.md", "x").unwrap_err().kind,
            ErrorKind::NotFound
        );
    }

    #[test]
    fn write_bytes_round_trips() {
        let (_d, root) = vault();
        let png = [0x89u8, b'P', b'N', b'G', 0, 1, 2, 255];
        write_bytes_atomic(&root, "image.png", &png).unwrap();
        assert_eq!(fs::read(root.join("image.png")).unwrap(), png);
    }

    #[test]
    fn rename_moves_files_and_folders() {
        let (_d, root) = vault();
        ensure_dir(&root, "Notes/Archive").unwrap();
        write_text_atomic(&root, "Notes/a.md", "a").unwrap();
        rename(&root, "Notes/a.md", "Notes/Archive/b.md").unwrap();
        assert_eq!(read_text(&root, "Notes/Archive/b.md").unwrap(), "a");
        assert!(!exists(&root, "Notes/a.md").unwrap());

        rename(&root, "Notes", "Lab notes").unwrap();
        assert_eq!(read_text(&root, "Lab notes/Archive/b.md").unwrap(), "a");
    }

    #[test]
    fn rename_refuses_to_replace_or_nest() {
        let (_d, root) = vault();
        ensure_dir(&root, "Notes/Inner").unwrap();
        write_text_atomic(&root, "a.md", "a").unwrap();
        write_text_atomic(&root, "b.md", "b").unwrap();
        assert_eq!(
            rename(&root, "a.md", "b.md").unwrap_err().kind,
            ErrorKind::AlreadyExists
        );
        assert_eq!(read_text(&root, "b.md").unwrap(), "b");
        assert_eq!(
            rename(&root, "Notes", "Notes/Inner/x").unwrap_err().kind,
            ErrorKind::InvalidPath
        );
        assert_eq!(
            rename(&root, "", "x").unwrap_err().kind,
            ErrorKind::InvalidPath
        );
        assert_eq!(
            rename(&root, "gone.md", "x.md").unwrap_err().kind,
            ErrorKind::NotFound
        );
        assert_eq!(
            rename(&root, "a.md", "../a.md").unwrap_err().kind,
            ErrorKind::OutsideVault
        );
    }

    #[cfg(windows)]
    #[test]
    fn rename_allows_a_change_of_case_on_windows() {
        let (_d, root) = vault();
        write_text_atomic(&root, "page.md", "x").unwrap();
        rename(&root, "page.md", "Page.md").unwrap();
        let names: Vec<_> = list_dir(&root, "")
            .unwrap()
            .into_iter()
            .map(|e| e.name)
            .collect();
        assert_eq!(names, vec!["Page.md"]);
    }

    #[test]
    fn copy_in_copies_from_outside_with_limits() {
        let (_d, root) = vault();
        let outside = tempfile::tempdir().unwrap();
        let src = outside.path().join("run1.csv");
        fs::write(&src, "a,b\n1,2").unwrap();
        ensure_dir(&root, "attachments").unwrap();

        assert_eq!(
            copy_in(&root, &src, "attachments/run1.csv", 1024).unwrap(),
            7
        );
        assert_eq!(
            read_text(&root, "attachments/run1.csv").unwrap(),
            "a,b\n1,2"
        );
        assert_eq!(
            copy_in(&root, &src, "attachments/run1.csv", 1024)
                .unwrap_err()
                .kind,
            ErrorKind::AlreadyExists
        );
        assert_eq!(
            copy_in(&root, &src, "attachments/big.csv", 3)
                .unwrap_err()
                .kind,
            ErrorKind::TooLarge
        );
        assert_eq!(
            copy_in(&root, outside.path(), "attachments/dir", 1024)
                .unwrap_err()
                .kind,
            ErrorKind::NotAFile
        );
        let names: Vec<_> = list_dir(&root, "attachments")
            .unwrap()
            .into_iter()
            .map(|e| e.name)
            .collect();
        assert_eq!(names, vec!["run1.csv"], "no temp files are left behind");
    }

    #[test]
    fn trash_refuses_the_root_and_missing_items() {
        let (_d, root) = vault();
        assert_eq!(trash(&root, "").unwrap_err().kind, ErrorKind::InvalidPath);
        assert_eq!(
            trash(&root, "gone.md").unwrap_err().kind,
            ErrorKind::NotFound
        );
        assert_eq!(
            trash(&root, "../x").unwrap_err().kind,
            ErrorKind::OutsideVault
        );
    }

    /// Really moves a file to the Recycle Bin, so it is skipped by default.
    /// Run with: cargo test -- --ignored trash_moves
    #[test]
    #[ignore]
    fn trash_moves_a_file_to_the_recycle_bin() {
        let (_d, root) = vault();
        write_text_atomic(&root, "benchwork-trash-test.md", "x").unwrap();
        trash(&root, "benchwork-trash-test.md").unwrap();
        assert!(!exists(&root, "benchwork-trash-test.md").unwrap());
    }

    #[test]
    fn reads_bytes_up_to_a_limit() {
        let (_dir, root) = vault();
        write_bytes_atomic(&root, "data.bin", &[1, 2, 3, 4]).unwrap();
        assert_eq!(read_bytes(&root, "data.bin", 4).unwrap(), vec![1, 2, 3, 4]);
        assert_eq!(
            read_bytes(&root, "data.bin", 3).unwrap_err().kind,
            ErrorKind::TooLarge
        );
        ensure_dir(&root, "Folder").unwrap();
        assert_eq!(
            read_bytes(&root, "Folder", 100).unwrap_err().kind,
            ErrorKind::NotAFile
        );
        assert!(read_bytes(&root, "../outside.bin", 100).is_err());
    }

    #[test]
    fn removes_only_snapshot_files() {
        let (_dir, root) = vault();
        ensure_dir(&root, ".benchwork/snapshots/p1").unwrap();
        write_text_atomic(&root, ".benchwork/snapshots/p1/2026-10-22 103005.md", "old").unwrap();
        write_text_atomic(&root, "Page.md", "mine").unwrap();
        write_text_atomic(&root, ".benchwork/config.json", "{}").unwrap();

        remove_snapshot(&root, ".benchwork/snapshots/p1/2026-10-22 103005.md").unwrap();
        assert!(!exists(&root, ".benchwork/snapshots/p1/2026-10-22 103005.md").unwrap());

        for refused in [
            "Page.md",
            ".benchwork/config.json",
            ".benchwork/snapshots",
            ".benchwork/snapshots/p1",
            ".benchwork/snapshotsX/a.md",
            ".benchwork/snapshots/../config.json",
        ] {
            assert!(
                remove_snapshot(&root, refused).is_err(),
                "{refused} was removed"
            );
        }
        assert!(exists(&root, "Page.md").unwrap());
        assert!(exists(&root, ".benchwork/config.json").unwrap());
    }
}
