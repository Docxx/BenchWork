//! Runs Pandoc to turn Markdown into Word. This can run Pandoc and nothing
//! else: the program is found by name in the usual places, its arguments
//! are fixed here, and every file it reads or writes is a vault path that
//! went through the path guard. Pandoc is a separate program the person
//! installs; BenchWork never includes it.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::error::{ErrorKind, VaultError, VaultResult};
use crate::path_guard::{normalise, resolve};

#[cfg(windows)]
const PROGRAM: &str = "pandoc.exe";
#[cfg(not(windows))]
const PROGRAM: &str = "pandoc";

/// Where Pandoc's installers put it, besides folders on PATH.
fn known_places() -> Vec<PathBuf> {
    let mut places = Vec::new();
    #[cfg(windows)]
    {
        if let Some(local) = std::env::var_os("LOCALAPPDATA") {
            places.push(PathBuf::from(local).join("Pandoc").join(PROGRAM));
        }
        for var in ["ProgramFiles", "ProgramFiles(x86)"] {
            if let Some(dir) = std::env::var_os(var) {
                places.push(PathBuf::from(dir).join("Pandoc").join(PROGRAM));
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        places.push(PathBuf::from("/opt/homebrew/bin").join(PROGRAM));
        places.push(PathBuf::from("/usr/local/bin").join(PROGRAM));
    }
    places
}

/// Pandoc's full path: on PATH first, then where its installers put it.
pub fn find() -> Option<PathBuf> {
    let on_path = std::env::var_os("PATH")
        .map(|paths| std::env::split_paths(&paths).collect::<Vec<_>>())
        .unwrap_or_default();
    on_path
        .into_iter()
        .map(|dir| dir.join(PROGRAM))
        .chain(known_places())
        .find(|p| p.is_file())
}

fn command(program: &Path) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    // No console window flashing up on Windows.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// The version from `pandoc --version`, such as `3.5`, or None.
pub fn version() -> Option<String> {
    let program = find()?;
    let out = command(&program).arg("--version").output().ok()?;
    if !out.status.success() {
        return None;
    }
    parse_version(&String::from_utf8_lossy(&out.stdout))
}

/// `pandoc 3.5\nFeatures: ...` gives `3.5`.
pub fn parse_version(text: &str) -> Option<String> {
    let mut words = text.lines().next()?.split_whitespace();
    // On Windows the program may call itself `pandoc.exe`.
    if !words.next()?.to_ascii_lowercase().starts_with("pandoc") {
        return None;
    }
    let version = words.next()?;
    version
        .chars()
        .next()
        .filter(char::is_ascii_digit)
        .map(|_| version.to_string())
}

fn not_found() -> VaultError {
    VaultError::new(
        ErrorKind::NotFound,
        "Pandoc is not installed. Install it with: winget install JohnMacFarlane.Pandoc",
    )
}

/// A vault file that must already exist, such as the bibliography.
fn existing(root: &Path, rel: &str, what: &str) -> VaultResult<PathBuf> {
    let path = resolve(root, rel)?;
    if !path.is_file() {
        return Err(VaultError::new(
            ErrorKind::NotFound,
            format!("The {what} '{rel}' is not there"),
        ));
    }
    Ok(path)
}

/// Converts `markdown` to a Word file at `output` (a vault path ending
/// `.docx`), formatting citations from `bibliography` in the style `csl`.
pub fn to_word(
    root: &Path,
    markdown: &str,
    output: &str,
    bibliography: Option<&str>,
    csl: Option<&str>,
) -> VaultResult<()> {
    let program = find().ok_or_else(not_found)?;
    let out_rel = normalise(output)?;
    if !out_rel.to_ascii_lowercase().ends_with(".docx") {
        return Err(VaultError::new(
            ErrorKind::InvalidPath,
            "Word files end in .docx",
        ));
    }
    let out_path = resolve(root, &out_rel)?;
    let dir = out_path
        .parent()
        .filter(|d| d.is_dir())
        .ok_or_else(|| VaultError::new(ErrorKind::NotFound, "The export folder is not there"))?;
    let bib = bibliography
        .map(|b| existing(root, b, "bibliography"))
        .transpose()?;
    let style = csl
        .map(|c| existing(root, c, "citation style"))
        .transpose()?;

    // Pandoc reads the Markdown from a file and writes beside the output,
    // which is then renamed into place, so a failed run leaves nothing half-written.
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let input = std::env::temp_dir().join(format!("benchwork-{stamp}.md"));
    fs::write(&input, markdown).map_err(|e| VaultError::io("Cannot prepare the export", &e))?;
    let partial = dir.join(format!(".benchwork-{stamp}.docx.tmp"));

    let mut cmd = command(&program);
    cmd.arg(&input)
        .args(["--from", "markdown", "--to", "docx", "--standalone"])
        .arg("--resource-path")
        .arg(root)
        .arg("--output")
        .arg(&partial);
    if let Some(bib) = &bib {
        cmd.arg("--citeproc").arg("--bibliography").arg(bib);
    }
    if let Some(style) = &style {
        cmd.arg("--csl").arg(style);
    }
    let result = cmd.output();
    let _ = fs::remove_file(&input);
    let out = result.map_err(|e| VaultError::io("Cannot run Pandoc", &e))?;
    if !out.status.success() {
        let _ = fs::remove_file(&partial);
        let message = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(VaultError::new(
            ErrorKind::Io,
            format!("Pandoc could not make the Word file: {message}"),
        ));
    }
    fs::rename(&partial, &out_path).map_err(|e| {
        let _ = fs::remove_file(&partial);
        VaultError::io("Cannot save the Word file", &e)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::path_guard::canonical_root;

    #[test]
    fn reads_the_version_line() {
        assert_eq!(
            parse_version("pandoc 3.5\nFeatures: +server +lua\n").as_deref(),
            Some("3.5")
        );
        assert_eq!(
            parse_version("pandoc.exe 3.1.11.1\n").as_deref(),
            Some("3.1.11.1")
        );
        assert_eq!(parse_version("something else 1.0"), None);
        assert_eq!(parse_version(""), None);
    }

    #[test]
    fn refuses_outputs_that_are_not_word_files_in_the_vault() {
        let dir = tempfile::tempdir().unwrap();
        let root = canonical_root(dir.path()).unwrap();
        // Checked before anything runs, whether or not Pandoc is installed.
        if find().is_none() {
            return;
        }
        for bad in ["exports/x.exe", "../outside.docx", "exports/x.md"] {
            assert!(to_word(&root, "# Hi", bad, None, None).is_err(), "{bad}");
        }
    }

    #[test]
    fn refuses_a_bibliography_that_is_not_there() {
        let dir = tempfile::tempdir().unwrap();
        let root = canonical_root(dir.path()).unwrap();
        fs::create_dir(root.join("exports")).unwrap();
        if find().is_none() {
            return;
        }
        let err = to_word(&root, "# Hi", "exports/a.docx", Some("missing.json"), None).unwrap_err();
        assert_eq!(err.kind, ErrorKind::NotFound);
        assert!(!root.join("exports").join("a.docx").exists());
    }
}
