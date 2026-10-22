//! Every file command goes through this guard. Paths from the front end are
//! vault-relative, use `/` separators, and must resolve inside the open vault,
//! including after following symlinks. The same rules live in
//! `src/core/platform/vaultPath.ts`; both are tested against
//! `src/core/platform/vault-path-cases.json`.

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{ErrorKind, VaultError, VaultResult};

const RESERVED_NAMES: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

fn invalid(rel: &str, reason: &str) -> VaultError {
    VaultError::new(
        ErrorKind::InvalidPath,
        format!("Invalid path '{rel}': {reason}"),
    )
}

fn check_name(rel: &str, name: &str) -> VaultResult<()> {
    if let Some(c) = name
        .chars()
        .find(|c| (*c as u32) < 0x20 || "<>:\"|?*".contains(*c))
    {
        return Err(invalid(rel, &format!("contains '{}'", c.escape_default())));
    }
    if name.ends_with('.') || name.ends_with(' ') {
        return Err(invalid(rel, "a name may not end with a dot or space"));
    }
    let base = name.split('.').next().unwrap_or(name);
    if RESERVED_NAMES.iter().any(|r| r.eq_ignore_ascii_case(base)) {
        return Err(invalid(
            rel,
            &format!("'{name}' is a reserved name on Windows"),
        ));
    }
    Ok(())
}

/// Checks a vault-relative path and returns its normal form: no leading,
/// trailing or doubled slashes, and no `.` segments. `""` is the vault root.
pub fn normalise(rel: &str) -> VaultResult<String> {
    if rel.contains('\\') {
        return Err(invalid(rel, "use '/' as the separator"));
    }
    if rel.starts_with('/') {
        return Err(invalid(rel, "paths must be relative to the vault"));
    }
    let mut parts: Vec<&str> = Vec::new();
    for part in rel.split('/') {
        match part {
            "" | "." => continue,
            ".." => {
                return Err(VaultError::new(
                    ErrorKind::OutsideVault,
                    format!("Path '{rel}' may not use '..'"),
                ))
            }
            name => {
                check_name(rel, name)?;
                parts.push(name);
            }
        }
    }
    Ok(parts.join("/"))
}

/// Canonicalises a folder chosen as the vault root.
pub fn canonical_root(root: &Path) -> VaultResult<PathBuf> {
    let canon = fs::canonicalize(root).map_err(|e| VaultError::io("Cannot open vault", &e))?;
    if !canon.is_dir() {
        return Err(VaultError::new(
            ErrorKind::NotADirectory,
            format!("'{}' is not a folder", root.display()),
        ));
    }
    Ok(canon)
}

/// Resolves a vault-relative path against a canonical root. The deepest part
/// of the path that already exists is canonicalised (following symlinks) and
/// must still lie inside the root. Parts that do not exist yet cannot escape,
/// because `normalise` has rejected `..`.
pub fn resolve(root: &Path, rel: &str) -> VaultResult<PathBuf> {
    let normal = normalise(rel)?;
    let mut full = root.to_path_buf();
    if !normal.is_empty() {
        full.extend(normal.split('/'));
    }

    let mut probe = full.as_path();
    loop {
        match fs::symlink_metadata(probe) {
            Ok(_) => break,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                probe = probe.parent().ok_or_else(|| outside(rel))?;
            }
            Err(e) => return Err(VaultError::io("Cannot check path", &e)),
        }
    }

    // `probe` exists. If it cannot be canonicalised it is a dangling link,
    // which could otherwise be used to write outside the vault.
    let canon = fs::canonicalize(probe).map_err(|_| outside(rel))?;
    if !canon.starts_with(root) {
        return Err(outside(rel));
    }
    Ok(full)
}

fn outside(rel: &str) -> VaultError {
    VaultError::new(
        ErrorKind::OutsideVault,
        format!("Path '{rel}' leads outside the vault"),
    )
}

/// Turns a canonical Windows path such as `\\?\C:\Vault` back into the form
/// people recognise (`C:\Vault`). Other paths are returned unchanged.
pub fn display_path(path: &Path) -> String {
    let s = path.to_string_lossy();
    if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{rest}");
    }
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        let b = rest.as_bytes();
        if b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':' {
            return rest.to_string();
        }
    }
    s.into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Cases {
        valid: Vec<(String, String)>,
        invalid: Vec<(String, ErrorKindName)>,
    }

    #[derive(Deserialize, Debug, PartialEq)]
    enum ErrorKindName {
        InvalidPath,
        OutsideVault,
    }

    fn cases() -> Cases {
        serde_json::from_str(include_str!(
            "../../src/core/platform/vault-path-cases.json"
        ))
        .unwrap()
    }

    #[test]
    fn shared_valid_cases_normalise() {
        for (input, expected) in cases().valid {
            assert_eq!(normalise(&input).unwrap(), expected, "input {input:?}");
        }
    }

    #[test]
    fn shared_invalid_cases_are_rejected() {
        for (input, expected) in cases().invalid {
            let err = normalise(&input).expect_err(&input);
            let kind = match err.kind {
                ErrorKind::InvalidPath => ErrorKindName::InvalidPath,
                ErrorKind::OutsideVault => ErrorKindName::OutsideVault,
                other => panic!("unexpected kind {other:?} for {input:?}"),
            };
            assert_eq!(kind, expected, "input {input:?}");
        }
    }

    #[test]
    fn resolves_existing_and_new_paths_inside_root() {
        let dir = tempfile::tempdir().unwrap();
        let root = canonical_root(dir.path()).unwrap();
        fs::create_dir(root.join("Notes")).unwrap();

        assert_eq!(resolve(&root, "").unwrap(), root);
        assert_eq!(resolve(&root, "Notes").unwrap(), root.join("Notes"));
        assert_eq!(
            resolve(&root, "Notes/new/deeper.md").unwrap(),
            root.join("Notes").join("new").join("deeper.md")
        );
    }

    #[test]
    fn rejects_dot_dot_before_touching_disk() {
        let dir = tempfile::tempdir().unwrap();
        let root = canonical_root(dir.path()).unwrap();
        let err = resolve(&root, "../escape.md").unwrap_err();
        assert_eq!(err.kind, ErrorKind::OutsideVault);
    }

    #[test]
    fn canonical_root_rejects_files_and_missing_folders() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("file.txt");
        fs::write(&file, "x").unwrap();
        assert_eq!(
            canonical_root(&file).unwrap_err().kind,
            ErrorKind::NotADirectory
        );
        assert_eq!(
            canonical_root(&dir.path().join("missing"))
                .unwrap_err()
                .kind,
            ErrorKind::NotFound
        );
    }

    /// Creates a directory link. On Windows a symlink needs Developer Mode or
    /// admin rights, so this falls back to a junction, which needs neither.
    fn try_symlink_dir(target: &Path, link: &Path) -> bool {
        #[cfg(windows)]
        {
            if std::os::windows::fs::symlink_dir(target, link).is_ok() {
                return true;
            }
            std::process::Command::new("cmd")
                .args(["/C", "mklink", "/J"])
                .arg(link)
                .arg(target)
                .output()
                .is_ok_and(|o| o.status.success())
        }
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(target, link).is_ok()
        }
    }

    fn try_symlink_file(target: &Path, link: &Path) -> bool {
        #[cfg(windows)]
        let made = std::os::windows::fs::symlink_file(target, link);
        #[cfg(unix)]
        let made = std::os::unix::fs::symlink(target, link);
        made.is_ok()
    }

    #[test]
    fn rejects_symlink_that_escapes_the_vault() {
        let vault = tempfile::tempdir().unwrap();
        let outside_dir = tempfile::tempdir().unwrap();
        let root = canonical_root(vault.path()).unwrap();
        if !try_symlink_dir(outside_dir.path(), &root.join("escape")) {
            eprintln!("skipped: cannot create symlinks on this machine");
            return;
        }
        for rel in ["escape", "escape/secret.md", "escape/new/file.md"] {
            assert_eq!(
                resolve(&root, rel).unwrap_err().kind,
                ErrorKind::OutsideVault,
                "{rel}"
            );
        }
    }

    #[test]
    fn rejects_dangling_symlink() {
        let vault = tempfile::tempdir().unwrap();
        let outside_dir = tempfile::tempdir().unwrap();
        let root = canonical_root(vault.path()).unwrap();
        let target = outside_dir.path().join("not-yet.md");
        if !try_symlink_file(&target, &root.join("dangling.md")) {
            eprintln!("skipped: cannot create symlinks on this machine");
            return;
        }
        assert_eq!(
            resolve(&root, "dangling.md").unwrap_err().kind,
            ErrorKind::OutsideVault
        );
    }

    #[test]
    fn rejects_dangling_folder_link() {
        let vault = tempfile::tempdir().unwrap();
        let outside_dir = tempfile::tempdir().unwrap();
        let root = canonical_root(vault.path()).unwrap();
        let target = outside_dir.path().join("gone");
        fs::create_dir(&target).unwrap();
        if !try_symlink_dir(&target, &root.join("dangling")) {
            eprintln!("skipped: cannot create folder links on this machine");
            return;
        }
        fs::remove_dir(&target).unwrap();
        for rel in ["dangling", "dangling/new.md"] {
            assert_eq!(
                resolve(&root, rel).unwrap_err().kind,
                ErrorKind::OutsideVault,
                "{rel}"
            );
        }
    }

    #[test]
    fn allows_symlink_that_stays_inside_the_vault() {
        let vault = tempfile::tempdir().unwrap();
        let root = canonical_root(vault.path()).unwrap();
        fs::create_dir(root.join("Real")).unwrap();
        if !try_symlink_dir(&root.join("Real"), &root.join("Alias")) {
            eprintln!("skipped: cannot create symlinks on this machine");
            return;
        }
        assert!(resolve(&root, "Alias/page.md").is_ok());
    }

    #[test]
    fn display_path_strips_verbatim_prefix() {
        assert_eq!(display_path(Path::new(r"\\?\C:\Vault")), r"C:\Vault");
        assert_eq!(
            display_path(Path::new(r"\\?\UNC\server\share\Vault")),
            r"\\server\share\Vault"
        );
        assert_eq!(
            display_path(Path::new("/home/ray/Vault")),
            "/home/ray/Vault"
        );
    }
}
