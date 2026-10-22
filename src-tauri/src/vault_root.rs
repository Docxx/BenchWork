//! Finds the vault a chosen folder belongs to, so BenchWork never sets up a
//! vault inside `.benchwork`, and can ask before setting one up inside
//! another vault. This only checks whether folders exist; it reads no files,
//! and it is the one place that looks outside an open vault.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::VaultResult;
use crate::path_guard::canonical_root;

pub const VAULT_DIR: &str = ".benchwork";

/// How the chosen folder relates to the vault that was found.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Via {
    /// The folder is a vault itself.
    SelfVault,
    /// The folder is a `.benchwork` folder or inside one; it always belongs
    /// to the vault above it.
    Benchwork,
    /// An ordinary folder inside a vault. It could open that vault, or become
    /// a separate vault of its own.
    Ancestor,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VaultOwner {
    /// The vault folder.
    pub root: PathBuf,
    /// The chosen folder, canonicalised.
    pub folder: PathBuf,
    pub via: Via,
}

fn is_vault_dir_name(path: &Path) -> bool {
    path.file_name()
        .is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case(VAULT_DIR))
}

/// Walks up from `start` (itself included) to the nearest folder that has a
/// `.benchwork` folder. Folders named `.benchwork` are skipped on the way,
/// so BenchWork's own folder, or a stray one inside it, never counts as a
/// vault. Returns `None` if no ancestor is a vault.
pub fn find_vault_root(start: &Path) -> VaultResult<Option<VaultOwner>> {
    let folder = canonical_root(start)?;
    let mut through_benchwork = false;
    for candidate in folder.ancestors() {
        if is_vault_dir_name(candidate) {
            through_benchwork = true;
            continue;
        }
        if candidate.join(VAULT_DIR).is_dir() {
            let via = if through_benchwork {
                Via::Benchwork
            } else if candidate == folder {
                Via::SelfVault
            } else {
                Via::Ancestor
            };
            return Ok(Some(VaultOwner {
                root: candidate.to_path_buf(),
                folder: folder.clone(),
                via,
            }));
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

    fn owner(start: &Path) -> Option<(PathBuf, Via)> {
        find_vault_root(start).unwrap().map(|o| (o.root, o.via))
    }

    #[test]
    fn a_vault_finds_itself() {
        let (_d, root) = setup();
        fs::create_dir(root.join(VAULT_DIR)).unwrap();
        assert_eq!(owner(&root), Some((root, Via::SelfVault)));
    }

    #[test]
    fn the_benchwork_folder_belongs_to_its_parent() {
        let (_d, root) = setup();
        fs::create_dir(root.join(VAULT_DIR)).unwrap();
        assert_eq!(owner(&root.join(VAULT_DIR)), Some((root, Via::Benchwork)));
    }

    #[test]
    fn an_ordinary_folder_inside_a_vault_is_an_ancestor_match() {
        let (_d, root) = setup();
        fs::create_dir(root.join(VAULT_DIR)).unwrap();
        let data = root.join("LPS model").join("Data");
        fs::create_dir_all(&data).unwrap();
        let found = find_vault_root(&data).unwrap().unwrap();
        assert_eq!((found.root, found.via), (root, Via::Ancestor));
        assert_eq!(found.folder, canonical_root(&data).unwrap());
    }

    #[test]
    fn a_stray_benchwork_inside_benchwork_does_not_count() {
        // The state left by opening `.benchwork` itself as a vault.
        let (_d, root) = setup();
        let stray = root.join(VAULT_DIR).join(VAULT_DIR);
        fs::create_dir_all(stray.join("Test")).unwrap();
        assert_eq!(
            owner(&root.join(VAULT_DIR)),
            Some((root.clone(), Via::Benchwork))
        );
        assert_eq!(owner(&stray.join("Test")), Some((root, Via::Benchwork)));
    }

    #[test]
    fn the_nearest_vault_wins() {
        let (_d, root) = setup();
        let inner = root.join("Projects").join("Inner");
        fs::create_dir_all(root.join(VAULT_DIR)).unwrap();
        fs::create_dir_all(inner.join(VAULT_DIR)).unwrap();
        fs::create_dir(inner.join("Data")).unwrap();
        assert_eq!(owner(&inner), Some((inner.clone(), Via::SelfVault)));
        assert_eq!(owner(&inner.join("Data")), Some((inner, Via::Ancestor)));
    }

    #[test]
    fn a_plain_folder_has_no_vault() {
        let (_d, root) = setup();
        fs::create_dir(root.join("Thesis")).unwrap();
        assert_eq!(owner(&root.join("Thesis")), None);
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
