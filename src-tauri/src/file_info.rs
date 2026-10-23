//! Size, time and SHA-256 checksum of a file, inside the vault or outside it
//! (a large data file that is linked rather than copied). Nothing here
//! writes or changes a file.

use std::fs;
use std::io::Read;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::error::{ErrorKind, VaultError, VaultResult};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub size: u64,
    /// Milliseconds since the Unix epoch, if the OS reports it.
    pub modified: Option<u64>,
}

fn require_file(path: &Path) -> VaultResult<fs::Metadata> {
    let meta = fs::metadata(path).map_err(|e| VaultError::io("Cannot read file", &e))?;
    if !meta.is_file() {
        return Err(VaultError::new(ErrorKind::NotAFile, "That is not a file"));
    }
    Ok(meta)
}

pub fn file_info(path: &Path) -> VaultResult<FileInfo> {
    let meta = require_file(path)?;
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .and_then(|d| u64::try_from(d.as_millis()).ok());
    Ok(FileInfo {
        size: meta.len(),
        modified,
    })
}

/// The file's SHA-256 as lower-case hex. Reads in chunks, so files of any
/// size use little memory.
pub fn sha256(path: &Path) -> VaultResult<String> {
    require_file(path)?;
    let mut file = fs::File::open(path).map_err(|e| VaultError::io("Cannot open file", &e))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| VaultError::io("Cannot read file", &e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_known_values() {
        let dir = tempfile::tempdir().unwrap();
        let empty = dir.path().join("empty.bin");
        fs::write(&empty, b"").unwrap();
        assert_eq!(
            sha256(&empty).unwrap(),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        let abc = dir.path().join("abc.txt");
        fs::write(&abc, b"abc").unwrap();
        assert_eq!(
            sha256(&abc).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn hashes_files_bigger_than_one_chunk() {
        let dir = tempfile::tempdir().unwrap();
        let big = dir.path().join("big.bin");
        let data: Vec<u8> = (0..(3 << 20) + 17).map(|i| (i % 251) as u8).collect();
        fs::write(&big, &data).unwrap();
        let expected: String = Sha256::digest(&data)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        assert_eq!(sha256(&big).unwrap(), expected);
    }

    #[test]
    fn reports_size_and_refuses_folders() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.csv");
        fs::write(&file, b"x,y\n1,2\n").unwrap();
        let info = file_info(&file).unwrap();
        assert_eq!(info.size, 8);
        assert!(info.modified.is_some());
        assert_eq!(file_info(dir.path()).unwrap_err().kind, ErrorKind::NotAFile);
        assert_eq!(sha256(dir.path()).unwrap_err().kind, ErrorKind::NotAFile);
        assert_eq!(
            file_info(&dir.path().join("missing")).unwrap_err().kind,
            ErrorKind::NotFound
        );
    }
}
