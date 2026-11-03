//! Conservative file replication. Concurrent versions are kept, never text/ink-unioned.
use crate::{path_guard, vault_fs};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::Path,
};
pub const MAX_FILE: usize = 32 * 1024 * 1024;
pub type Result<T> = std::result::Result<T, String>;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Entry {
    pub hash: String,
    pub size: u64,
}
#[derive(Default, Serialize, Deserialize)]
pub struct Inventory {
    pub files: BTreeMap<String, Entry>,
    pub skipped: Vec<String>,
}
pub fn hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|n| format!("{n:02x}"))
        .collect()
}
pub fn allowed(path: &str) -> bool {
    !path.is_empty()
        && path_guard::normalise(path).is_ok_and(|p| p == path)
        && !path.split('/').any(|p| p.starts_with('.'))
        && !path.ends_with(".tmp")
}
pub fn read(root: &Path, path: &str) -> Result<Option<Vec<u8>>> {
    if !allowed(path) {
        return Err("This path is excluded from device sync".into());
    }
    let file = path_guard::resolve(root, path).map_err(|e| e.message)?;
    match fs::metadata(&file) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
        Ok(meta) => {
            if !meta.is_file() || meta.len() > MAX_FILE as u64 {
                return Err(
                    "Only files up to 32 MB can sync; keep large data in Cloud storage".into(),
                );
            }
            let bytes = fs::read(file).map_err(|e| e.to_string())?;
            if bytes.len() > MAX_FILE {
                return Err("File grew beyond the sync size limit".into());
            }
            Ok(Some(bytes))
        }
    }
}
pub fn scan(root: &Path) -> Result<Inventory> {
    fn visit(
        root: &Path,
        folder: &str,
        out: &mut Inventory,
        names: &mut BTreeSet<String>,
    ) -> Result<()> {
        let directory = path_guard::resolve(root, folder).map_err(|e| e.message)?;
        for entry in fs::read_dir(directory).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| "A file name is not valid UTF-8")?;
            let path = if folder.is_empty() {
                name
            } else {
                format!("{folder}/{name}")
            };
            if !allowed(&path) {
                continue;
            }
            let kind = entry.file_type().map_err(|e| e.to_string())?;
            if kind.is_symlink() {
                return Err(format!("Sync does not follow symbolic links: {path}"));
            }
            if !names.insert(path.to_lowercase()) {
                return Err(format!("Resolve the file-name case collision: {path}"));
            }
            if names.len() > 20000 {
                return Err("This vault exceeds the 20,000-entry sync limit".into());
            }
            if kind.is_dir() {
                visit(root, &path, out, names)?;
            } else if kind.is_file() {
                if entry.metadata().map_err(|e| e.to_string())?.len() > MAX_FILE as u64 {
                    out.skipped.push(path);
                    continue;
                }
                if let Some(bytes) = read(root, &path)? {
                    out.files.insert(
                        path,
                        Entry {
                            hash: hash(&bytes),
                            size: bytes.len() as u64,
                        },
                    );
                }
            }
        }
        Ok(())
    }
    let mut out = Inventory::default();
    visit(root, "", &mut out, &mut BTreeSet::new())?;
    Ok(out)
}
pub fn current(root: &Path, path: &str) -> Result<Option<String>> {
    Ok(read(root, path)?.as_deref().map(hash))
}
pub fn save_json(root: &Path, path: &str, value: &impl Serialize) -> Result<()> {
    let target = path_guard::resolve(root, path).map_err(|e| e.message)?;
    fs::create_dir_all(target.parent().ok_or("Missing parent")?).map_err(|e| e.to_string())?;
    vault_fs::write_atomic(
        &target,
        &serde_json::to_vec(value).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.message)
}
/** A remote overwrite/delete retains a local recovery snapshot first. */
pub fn apply(
    root: &Path,
    path: &str,
    expected: Option<&str>,
    bytes: Option<&[u8]>,
) -> Result<bool> {
    let previous = read(root, path)?;
    if previous.as_deref().map(hash).as_deref() != expected {
        return Ok(false);
    }
    let target = path_guard::resolve(root, path).map_err(|e| e.message)?;
    if let Some(old) = &previous {
        let key = format!("{}-{}", hash(path.as_bytes()), hash(old));
        let recovery = path_guard::resolve(root, &format!(".benchwork/native-sync/recovery/{key}"))
            .map_err(|e| e.message)?;
        fs::create_dir_all(recovery.parent().ok_or("Missing recovery folder")?)
            .map_err(|e| e.to_string())?;
        if !recovery.exists() {
            vault_fs::write_atomic(&recovery, old).map_err(|e| e.message)?;
        }
        save_json(
            root,
            &format!(".benchwork/native-sync/recovery/{key}.json"),
            &serde_json::json!({"path":path,"hash":hash(old)}),
        )?;
    }
    if let Some(bytes) = bytes {
        if bytes.len() > MAX_FILE {
            return Err("File exceeds sync size limit".into());
        }
        fs::create_dir_all(target.parent().ok_or("Missing parent")?).map_err(|e| e.to_string())?;
        // Recheck after preparing the snapshot; external edits must not be overwritten.
        if current(root, path)?.as_deref() != expected {
            return Ok(false);
        }
        vault_fs::write_atomic(&target, bytes).map_err(|e| e.message)?;
    } else if previous.is_some() {
        if current(root, path)?.as_deref() != expected {
            return Ok(false);
        }
        fs::remove_file(target).map_err(|e| e.to_string())?;
    }
    Ok(true)
}
pub fn keep_copy(root: &Path, path: &str, bytes: &[u8]) -> Result<String> {
    let original = Path::new(path);
    let stem = original
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("Invalid filename")?;
    let ext = original
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| format!(".{s}"))
        .unwrap_or_default();
    let parent = original.parent().and_then(|s| s.to_str()).unwrap_or("");
    let suffix = &hash(bytes)[..12];
    for index in 0..1000 {
        let n = if index == 0 {
            String::new()
        } else {
            format!(" {index}")
        };
        let name = format!("{stem} (sync copy {suffix}{n}){ext}");
        let copy = if parent.is_empty() {
            name
        } else {
            format!("{parent}/{name}")
        };
        let existing = read(root, &copy)?;
        if existing.as_deref() == Some(bytes) {
            return Ok(copy);
        }
        if existing.is_none() {
            let target = path_guard::resolve(root, &copy).map_err(|e| e.message)?;
            use std::io::Write;
            let mut file = match fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(target)
            {
                Ok(f) => f,
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(e.to_string()),
            };
            file.write_all(bytes)
                .and_then(|_| file.sync_all())
                .map_err(|e| e.to_string())?;
            return Ok(copy);
        }
    }
    Err("Could not preserve a conflicting version".into())
}
#[derive(Debug, PartialEq)]
pub enum Action {
    Same,
    Push,
    Pull,
    Conflict,
}
pub fn action(base: Option<&str>, local: Option<&str>, remote: Option<&str>) -> Action {
    if local == remote {
        Action::Same
    } else if local == base {
        Action::Pull
    } else if remote == base {
        Action::Push
    } else {
        Action::Conflict
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn merge_decisions_preserve_both_edits_and_delete_edit_conflicts() {
        assert_eq!(action(Some("a"), Some("b"), Some("c")), Action::Conflict);
        assert_eq!(action(Some("a"), Some("b"), None), Action::Conflict);
        assert_eq!(action(Some("a"), Some("a"), None), Action::Pull);
        assert_eq!(action(Some("a"), None, Some("a")), Action::Push);
        assert_eq!(action(None, Some("a"), Some("b")), Action::Conflict);
        assert_eq!(action(None, None, Some("b")), Action::Pull);
    }
    #[test]
    fn rejects_excluded_paths_and_retains_recovery_before_atomic_updates() {
        let temp = tempfile::tempdir().unwrap();
        let root = path_guard::canonical_root(temp.path()).unwrap();
        assert!(!allowed("../escape"));
        assert!(!allowed(".benchwork/private.json"));
        assert!(!allowed("Folder/.secret"));
        assert!(apply(&root, "note.md", None, Some(b"first")).unwrap());
        assert!(!apply(&root, "note.md", None, Some(b"lost")).unwrap());
        let first = hash(b"first");
        assert!(apply(&root, "note.md", Some(&first), Some(b"second")).unwrap());
        let copy = keep_copy(&root, "note.md", b"offline").unwrap();
        assert_eq!(read(&root, &copy).unwrap().unwrap(), b"offline");
        assert_eq!(keep_copy(&root, "note.md", b"offline").unwrap(), copy);
        assert_eq!(scan(&root).unwrap().files.len(), 2);
        assert!(
            fs::read_dir(root.join(".benchwork/native-sync/recovery"))
                .unwrap()
                .count()
                >= 2
        );
    }
}
