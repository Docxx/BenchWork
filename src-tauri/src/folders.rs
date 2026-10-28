//! Choosing a vault folder inside the app, for Android, whose own folder
//! picker gives content links rather than folder paths. These work on full
//! paths outside any vault, and only list or make folders.

use std::fs;
use std::path::Path;

use crate::error::{VaultError, VaultResult};

/// The folders inside `path`, by name and sorted, leaving out hidden ones.
pub fn list_folders(path: &Path) -> VaultResult<Vec<String>> {
    let entries = fs::read_dir(path).map_err(|e| VaultError::io("Cannot list the folder", &e))?;
    let mut names: Vec<String> = entries
        .filter_map(Result::ok)
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|name| !name.starts_with('.'))
        .collect();
    names.sort_by_key(|n| n.to_lowercase());
    Ok(names)
}

/// Makes a new folder; fails if it is already there.
pub fn make_folder(path: &Path) -> VaultResult<()> {
    fs::create_dir(path).map_err(|e| VaultError::io("Cannot make the folder", &e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_visible_folders_in_order_and_makes_new_ones() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["beta", "Alpha", ".hidden"] {
            fs::create_dir(dir.path().join(name)).unwrap();
        }
        fs::write(dir.path().join("file.txt"), "x").unwrap();
        assert_eq!(list_folders(dir.path()).unwrap(), vec!["Alpha", "beta"]);
        make_folder(&dir.path().join("Vault")).unwrap();
        assert!(dir.path().join("Vault").is_dir());
        assert!(make_folder(&dir.path().join("Vault")).is_err());
        assert!(list_folders(&dir.path().join("missing")).is_err());
    }
}
