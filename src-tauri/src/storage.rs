//! Verified large-file copies to folders chosen for desktop cloud sync clients.
//! A local checksum cannot prove that the provider has completed its upload.
use crate::error::{ErrorKind, VaultError, VaultResult};
use crate::{file_info, path_guard};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifiedCopy {
    pub source: String,
    pub target: String,
    pub folder: String,
    pub size: u64,
    pub sha256: String,
}
fn fail(message: &str) -> VaultError {
    VaultError::new(ErrorKind::Io, message)
}
fn cancelled(stop: &AtomicBool) -> VaultResult<()> {
    if stop.load(Ordering::SeqCst) {
        Err(fail("Copy cancelled. Your source file is unchanged."))
    } else {
        Ok(())
    }
}
fn target(copy: &VerifiedCopy) -> VaultResult<PathBuf> {
    let folder = path_guard::canonical_root(Path::new(&copy.folder))?;
    let full = fs::canonicalize(&copy.target)
        .map_err(|e| VaultError::io("Cannot find stored copy", &e))?;
    if !full.starts_with(&folder)
        || !full.is_file()
        || copy.sha256.len() != 64
        || !copy.sha256.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err(fail("The stored file or checksum is not valid."));
    }
    Ok(full)
}
pub fn verify(copy: &VerifiedCopy) -> VaultResult<()> {
    let full = target(copy)?;
    if file_info::file_info(&full)?.size != copy.size || file_info::sha256(&full)? != copy.sha256 {
        return Err(fail(
            "The stored copy has changed or is incomplete. Keep your source file.",
        ));
    }
    Ok(())
}
pub fn copy(
    vault: &Path,
    source: &Path,
    folder: &Path,
    id: &str,
    stop: &AtomicBool,
) -> VaultResult<VerifiedCopy> {
    let vault = path_guard::canonical_root(vault)?;
    if id.is_empty()
        || id.len() > 100
        || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err(fail("Invalid transfer identifier."));
    }
    let folder = path_guard::canonical_root(folder)?;
    if folder.starts_with(&vault) {
        return Err(fail(
            "Choose a cloud folder outside this vault, so large files do not bloat your notes.",
        ));
    }
    let source = fs::canonicalize(source).map_err(|e| VaultError::io("Cannot open source", &e))?;
    let before = file_info::file_info(&source)?;
    cancelled(stop)?;
    let directory = folder.join(format!("BenchWork-{id}"));
    fs::create_dir(&directory).map_err(|e| VaultError::io("Cannot create transfer folder", &e))?;
    let name = source
        .file_name()
        .ok_or_else(|| fail("The source has no file name."))?;
    let destination = directory.join(name);
    let temporary = directory.join(".benchwork-partial");
    let result = (|| {
        let mut input =
            fs::File::open(&source).map_err(|e| VaultError::io("Cannot read source", &e))?;
        let mut output = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|e| VaultError::io("Cannot write copy", &e))?;
        let mut buffer = vec![0u8; 1 << 20];
        let mut hasher = Sha256::new();
        let mut size = 0;
        loop {
            cancelled(stop)?;
            let n = input
                .read(&mut buffer)
                .map_err(|e| VaultError::io("Cannot read source", &e))?;
            if n == 0 {
                break;
            }
            output
                .write_all(&buffer[..n])
                .map_err(|e| VaultError::io("Cannot write copy", &e))?;
            hasher.update(&buffer[..n]);
            size += n as u64;
        }
        output
            .sync_all()
            .map_err(|e| VaultError::io("Cannot finish copy", &e))?;
        drop(output);
        let sha256 = hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        if size != before.size
            || file_info::sha256(&source)? != sha256
            || file_info::sha256(&temporary)? != sha256
        {
            return Err(fail("Verification failed. The source may have changed during transfer. Your source was kept."));
        }
        cancelled(stop)?;
        if destination.exists() {
            return Err(fail(
                "A file appeared at the destination. Nothing was overwritten.",
            ));
        }
        fs::rename(&temporary, &destination)
            .map_err(|e| VaultError::io("Cannot finish verified copy", &e))?;
        Ok(VerifiedCopy {
            source: path_guard::display_path(&source),
            target: path_guard::display_path(&destination),
            folder: path_guard::display_path(&folder),
            size,
            sha256,
        })
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
        let _ = fs::remove_dir(&directory);
    }
    result
}
pub fn reveal(copy: &VerifiedCopy) -> VaultResult<()> {
    let full = target(copy)?;
    #[cfg(windows)]
    let status = std::process::Command::new("explorer.exe")
        .arg(format!("/select,{}", full.display()))
        .spawn();
    #[cfg(not(windows))]
    let status = std::process::Command::new(if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    })
    .arg(full.parent().ok_or_else(|| fail("Missing folder"))?)
    .spawn();
    status
        .map(|_| ())
        .map_err(|e| VaultError::io("Cannot open storage folder", &e))
}
pub fn open_file(copy: &VerifiedCopy) -> VaultResult<()> {
    crate::web_link::open_file(&target(copy)?)
}
pub fn recycle_source(copy: &VerifiedCopy) -> VaultResult<()> {
    verify(copy)?;
    let source =
        fs::canonicalize(&copy.source).map_err(|e| VaultError::io("Cannot find source", &e))?;
    let destination = target(copy)?;
    if source == destination
        || source.starts_with(path_guard::canonical_root(Path::new(&copy.folder))?)
    {
        return Err(fail(
            "A file inside the storage folder cannot be removed as a local source.",
        ));
    }
    if file_info::sha256(&source)? != copy.sha256 {
        return Err(fail("The source changed after copying and was kept."));
    }
    #[cfg(not(target_os = "android"))]
    {
        trash::delete(&source)
            .map_err(|e| fail(&format!("Cannot move source to the Recycle Bin: {e}")))
    }
    #[cfg(target_os = "android")]
    {
        Err(fail("Manage local storage on the computer."))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn copies_and_verifies_without_overwriting_or_modifying_source() {
        let root = tempfile::tempdir().unwrap();
        let vault = root.path().join("vault");
        let cloud = root.path().join("cloud");
        fs::create_dir(&vault).unwrap();
        fs::create_dir(&cloud).unwrap();
        let source = vault.join("image.tif");
        fs::write(&source, vec![42u8; 2_500_000]).unwrap();
        let receipt = copy(&vault, &source, &cloud, "one", &AtomicBool::new(false)).unwrap();
        verify(&receipt).unwrap();
        assert_eq!(receipt.size, 2_500_000);
        assert!(copy(&vault, &source, &cloud, "one", &AtomicBool::new(false)).is_err());
        assert!(source.exists());
        fs::write(&receipt.target, b"damaged").unwrap();
        assert!(verify(&receipt).is_err());
        assert!(recycle_source(&receipt).is_err());
        assert!(source.exists());
    }
    #[test]
    fn refuses_vault_destinations_cancelled_jobs_and_invalid_ids() {
        let root = tempfile::tempdir().unwrap();
        let vault = root.path().join("vault");
        let cloud = root.path().join("cloud");
        fs::create_dir(&vault).unwrap();
        fs::create_dir(&cloud).unwrap();
        let source = vault.join("x");
        fs::write(&source, b"data").unwrap();
        assert!(copy(&vault, &source, &vault, "one", &AtomicBool::new(false)).is_err());
        assert!(copy(
            &vault,
            &source,
            &cloud,
            "../escape",
            &AtomicBool::new(false)
        )
        .is_err());
        assert!(copy(&vault, &source, &cloud, "one", &AtomicBool::new(true)).is_err());
        assert!(source.exists());
    }
}
