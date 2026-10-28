//! Whole-vault backups: a dated zip file of the vault in a folder of the
//! person's choosing, ideally on another drive. Each device's own files (the
//! search index, recovery copies, the trash, sync apps' versions) are left
//! out, as they are rebuilt or kept per device. Restoring unpacks a backup
//! into a new folder beside it; nothing is ever unpacked over a vault.

use std::fs::{self, File};
use std::io::{self, BufWriter};
use std::path::{Path, PathBuf};

use serde::Serialize;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::error::{ErrorKind, VaultError, VaultResult};

/// Paths inside the vault never backed up: kept per device, or rebuilt.
const LEFT_OUT: &[&str] = &[
    ".benchwork/index.sqlite",
    ".benchwork/snapshots",
    ".benchwork/trash",
    ".stversions",
    ".stfolder",
];

/// Backups are named `<vault> backup <date> <time>.zip`.
const MARKER: &str = " backup ";

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub path: String,
    pub name: String,
    pub size: u64,
}

fn left_out(rel: &str) -> bool {
    LEFT_OUT.iter().any(|p| {
        rel == *p || rel.starts_with(&format!("{p}/")) || rel.starts_with(&format!("{p}-"))
    })
}

/// Every file and folder in the vault to back up, as `/`-separated paths.
fn walk(root: &Path, dir: &Path, out: &mut Vec<(String, bool)>) -> io::Result<()> {
    let mut entries: Vec<_> = fs::read_dir(dir)?.filter_map(Result::ok).collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let path = entry.path();
        let rel = path
            .strip_prefix(root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        if rel.is_empty() || left_out(&rel) {
            continue;
        }
        let kind = entry.file_type()?;
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            out.push((rel, true));
            walk(root, &path, out)?;
        } else {
            out.push((rel, false));
        }
    }
    Ok(())
}

/// Backups of the vault named `name` in `folder`, oldest first.
pub fn list_backups(folder: &Path, name: &str) -> VaultResult<Vec<BackupFile>> {
    let prefix = format!("{name}{MARKER}");
    let mut found: Vec<BackupFile> = fs::read_dir(folder)
        .map_err(|e| VaultError::io("Cannot list the backups folder", &e))?
        .filter_map(Result::ok)
        .filter_map(|e| {
            let file = e.file_name().into_string().ok()?;
            if !file.starts_with(&prefix) || !file.to_lowercase().ends_with(".zip") {
                return None;
            }
            let size = e.metadata().ok()?.len();
            Some(BackupFile {
                path: e.path().to_string_lossy().into_owned(),
                name: file,
                size,
            })
        })
        .collect();
    // The date and time in the name sort as text.
    found.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(found)
}

/// Writes a backup of `root` into `folder`, named with `stamp` (such as
/// `2026-10-28 1330`), through a temporary file so a half-written backup is
/// never left behind. Returns the new backup.
pub fn backup_vault(
    root: &Path,
    folder: &Path,
    name: &str,
    stamp: &str,
) -> VaultResult<BackupFile> {
    if folder.starts_with(root) {
        return Err(VaultError::new(
            ErrorKind::InvalidPath,
            "Backups cannot go inside the vault itself. Choose a folder outside it.",
        ));
    }
    fs::create_dir_all(folder).map_err(|e| VaultError::io("Cannot make the backups folder", &e))?;
    let file_name = format!("{name}{MARKER}{stamp}.zip");
    let target = folder.join(&file_name);
    let tmp = folder.join(format!(".{file_name}.part"));

    let result = (|| -> io::Result<()> {
        let mut items = Vec::new();
        walk(root, root, &mut items)?;
        let mut zip = ZipWriter::new(BufWriter::new(File::create(&tmp)?));
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .large_file(true);
        for (rel, is_dir) in items {
            if is_dir {
                zip.add_directory(&rel, options)?;
            } else {
                zip.start_file(&rel, options)?;
                io::copy(&mut File::open(root.join(&rel))?, &mut zip)?;
            }
        }
        zip.finish()?;
        Ok(())
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&tmp);
        return Err(VaultError::io("Cannot write the backup", &e));
    }
    fs::rename(&tmp, &target).map_err(|e| VaultError::io("Cannot finish the backup", &e))?;
    let size = fs::metadata(&target).map(|m| m.len()).unwrap_or(0);
    Ok(BackupFile {
        path: target.to_string_lossy().into_owned(),
        name: file_name,
        size,
    })
}

/// The older backups beyond the newest `keep`, to be put away.
pub fn surplus(backups: &[BackupFile], keep: usize) -> Vec<PathBuf> {
    let extra = backups.len().saturating_sub(keep.max(1));
    backups[..extra]
        .iter()
        .map(|b| PathBuf::from(&b.path))
        .collect()
}

/// Unpacks a backup into a new folder beside it, named after it, and
/// returns that folder. Refuses if the folder is already there.
pub fn restore_backup(zip_path: &Path) -> VaultResult<String> {
    let stem = zip_path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .ok_or_else(|| VaultError::new(ErrorKind::InvalidPath, "That is not a backup file"))?;
    let parent = zip_path
        .parent()
        .ok_or_else(|| VaultError::new(ErrorKind::InvalidPath, "That is not a backup file"))?;
    let target = parent.join(stem.replacen(MARKER.trim(), "restored from", 1));
    if target.exists() {
        return Err(VaultError::new(
            ErrorKind::AlreadyExists,
            format!("{} is already there", target.display()),
        ));
    }
    let file = File::open(zip_path).map_err(|e| VaultError::io("Cannot open the backup", &e))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|e| VaultError::new(ErrorKind::Io, format!("The backup cannot be read: {e}")))?;
    // Unpacks only inside the new folder: names that would leave it are refused.
    archive.extract(&target).map_err(|e| {
        let _ = fs::remove_dir_all(&target);
        VaultError::new(ErrorKind::Io, format!("The backup cannot be unpacked: {e}"))
    })?;
    Ok(target.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::create_dir_all(root.join(".benchwork/snapshots")).unwrap();
        fs::create_dir_all(root.join("Lab/attachments")).unwrap();
        fs::write(root.join(".benchwork/config.json"), "{}").unwrap();
        fs::write(root.join(".benchwork/index.sqlite"), "index").unwrap();
        fs::write(root.join(".benchwork/index.sqlite-wal"), "wal").unwrap();
        fs::write(root.join(".benchwork/snapshots/a.md"), "old").unwrap();
        fs::write(root.join("Lab/Plan.md"), "# Plan\n").unwrap();
        fs::write(root.join("Lab/attachments/gel.png"), [1u8, 2, 3]).unwrap();
        dir
    }

    #[test]
    fn backs_up_the_vault_without_each_devices_own_files_and_restores_it() {
        let v = vault();
        let out = tempfile::tempdir().unwrap();
        let made = backup_vault(v.path(), out.path(), "Lab vault", "2026-10-28 1330").unwrap();
        assert_eq!(made.name, "Lab vault backup 2026-10-28 1330.zip");
        assert!(made.size > 0);

        let restored = PathBuf::from(restore_backup(Path::new(&made.path)).unwrap());
        assert!(restored.ends_with("Lab vault restored from 2026-10-28 1330"));
        assert_eq!(
            fs::read_to_string(restored.join("Lab/Plan.md")).unwrap(),
            "# Plan\n"
        );
        assert_eq!(
            fs::read(restored.join("Lab/attachments/gel.png")).unwrap(),
            [1, 2, 3]
        );
        assert!(restored.join(".benchwork/config.json").exists());
        assert!(!restored.join(".benchwork/index.sqlite").exists());
        assert!(!restored.join(".benchwork/index.sqlite-wal").exists());
        assert!(!restored.join(".benchwork/snapshots").exists());
        // Never unpacked over a folder already there.
        assert!(restore_backup(Path::new(&made.path)).is_err());
    }

    #[test]
    fn lists_backups_oldest_first_and_knows_which_to_put_away() {
        let v = vault();
        let out = tempfile::tempdir().unwrap();
        for stamp in ["2026-10-28 1330", "2026-10-26 0900", "2026-10-27 0900"] {
            backup_vault(v.path(), out.path(), "Lab vault", stamp).unwrap();
        }
        fs::write(out.path().join("Other backup 2026-10-01 0000.zip"), "x").unwrap();
        let list = list_backups(out.path(), "Lab vault").unwrap();
        let names: Vec<_> = list.iter().map(|b| b.name.as_str()).collect();
        assert_eq!(
            names,
            [
                "Lab vault backup 2026-10-26 0900.zip",
                "Lab vault backup 2026-10-27 0900.zip",
                "Lab vault backup 2026-10-28 1330.zip"
            ]
        );
        let old = surplus(&list, 2);
        assert_eq!(old.len(), 1);
        assert!(old[0].ends_with("Lab vault backup 2026-10-26 0900.zip"));
    }

    #[test]
    fn refuses_a_backups_folder_inside_the_vault() {
        let v = vault();
        assert!(backup_vault(v.path(), &v.path().join("backups"), "Lab", "x").is_err());
    }
}
