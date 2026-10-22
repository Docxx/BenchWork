//! Finds the vault a chosen folder belongs to, so picking a `.benchwork`
//! folder or a folder inside a vault opens that vault instead of setting up
//! a new one inside it. This only checks whether folders exist; it reads no
//! files, and it is the one place that looks outside an open vault.

use std::path::{Path, PathBuf};

use crate::error::VaultResult;
use crate::path_guard::canonical_root;

pub const VAULT_DIR: &str = ".benchwork";

fn is_vault_dir_name(path: &Path) -> bool {
    path.file_name()
        .is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case(VAULT_DIR))
}

/// Walks up from `start` (itself included) and returns the nearest folder
/// that has a `.benchwork` folder. Folders named `.benchwork` are skipped,
/// as is anything inside one, so BenchWork's own folder never counts as a
/// vault. Returns `None` if no ancestor is a vault.
pub fn find_vault_root(start: &Path) -> VaultResult<Option<PathBuf>> {
    let start = canonical_root(start)?;
    for candidate in start.ancestors() {
        // A folder inside `.benchwork` may itself hold a stray `.benchwork`;
        // skipping every `.benchwork` on the way up ignores those and carries
        // on to the vault that owns them.
        if is_vault_dir_name(candidate) {
            continue;
        }
        if candidate.join(VAULT_DIR).is_dir() {
            return Ok(Some(candidate.to_path_buf()));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorKind;
    use std::fs;

    fn setup() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = canonical_root(dir.path()).unwrap();
        (dir, root)
    }

    #[test]
    fn a_vault_finds_itself() {
        let (_d, root) = setup();
        fs::create_dir(root.join(VAULT_DIR)).unwrap();
        assert_eq!(find_vault_root(&root).unwrap(), Some(root));
    }

    #[test]
    fn the_benchwork_folder_belongs_to_its_parent() {
        let (_d, root) = setup();
        fs::create_dir(root.join(VAULT_DIR)).unwrap();
        assert_eq!(find_vault_root(&root.join(VAULT_DIR)).unwrap(), Some(root));
    }

    #[test]
    fn a_folder_inside_a_vault_belongs_to_it() {
        let (_d, root) = setup();
        fs::create_dir(root.join(VAULT_DIR)).unwrap();
        fs::create_dir_all(root.join("LPS model").join("Data")).unwrap();
        assert_eq!(
            find_vault_root(&root.join("LPS model").join("Data")).unwrap(),
            Some(root)
        );
    }

    #[test]
    fn a_stray_benchwork_inside_benchwork_does_not_count() {
        // The state left by opening `.benchwork` itself as a vault.
        let (_d, root) = setup();
        let stray = root.join(VAULT_DIR).join(VAULT_DIR);
        fs::create_dir_all(stray.join("Test")).unwrap();
        assert_eq!(
            find_vault_root(&root.join(VAULT_DIR)).unwrap(),
            Some(root.clone())
        );
        assert_eq!(find_vault_root(&stray.join("Test")).unwrap(), Some(root));
    }

    #[test]
    fn the_nearest_vault_wins() {
        let (_d, root) = setup();
        let inner = root.join("Projects").join("Inner");
        fs::create_dir_all(root.join(VAULT_DIR)).unwrap();
        fs::create_dir_all(inner.join(VAULT_DIR)).unwrap();
        fs::create_dir(inner.join("Data")).unwrap();
        assert_eq!(find_vault_root(&inner.join("Data")).unwrap(), Some(inner));
    }

    #[test]
    fn a_plain_folder_has_no_vault() {
        let (_d, root) = setup();
        fs::create_dir(root.join("Thesis")).unwrap();
        assert_eq!(find_vault_root(&root.join("Thesis")).unwrap(), None);
    }

    #[test]
    fn a_missing_folder_is_an_error() {
        let (_d, root) = setup();
        assert_eq!(
            find_vault_root(&root.join("gone")).unwrap_err().kind,
            ErrorKind::NotFound
        );
    }
}
