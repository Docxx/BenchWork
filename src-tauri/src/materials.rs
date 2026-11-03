//! Read-only source imports. Every import has a new vault directory.
use crate::error::{ErrorKind, VaultError, VaultResult};
use crate::{path_guard, vault_fs};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
const LIMIT: u64 = 64 * 1024 * 1024;

pub fn import_file(root: &Path, source: &Path, folder: &str) -> VaultResult<String> {
    let name = source.file_name().and_then(|s| s.to_str()).ok_or_else(|| {
        VaultError::new(ErrorKind::InvalidPath, "Choose a file with a valid name")
    })?;
    let extension = source
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ![
        "pdf", "pptx", "png", "jpg", "jpeg", "webp", "gif", "mp3", "ogg", "wav", "m4a", "json",
    ]
    .contains(&extension.as_str())
    {
        return Err(VaultError::new(
            ErrorKind::InvalidPath,
            "That material type is not supported",
        ));
    }
    let directory = path_guard::resolve(root, folder)?;
    if directory.exists() {
        return Err(VaultError::new(
            ErrorKind::AlreadyExists,
            "Use a new import folder",
        ));
    }
    fs::create_dir_all(&directory)
        .map_err(|e| VaultError::io("Cannot create import folder", &e))?;
    let target = format!("{folder}/{name}");
    vault_fs::copy_in(root, source, &target, LIMIT)?;
    Ok(target)
}
#[derive(Debug, Serialize, Deserialize)]
pub struct SlideImage {
    pub title: String,
    pub notes: String,
    pub image: String,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct ImportedSlides {
    pub source: String,
    pub slides: Vec<SlideImage>,
}

pub fn import_powerpoint(root: &Path, source: &Path, folder: &str) -> VaultResult<ImportedSlides> {
    if source
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase()
        != "pptx"
    {
        return Err(VaultError::new(
            ErrorKind::InvalidPath,
            "Choose a .pptx presentation",
        ));
    }
    #[cfg(not(windows))]
    {
        let _ = (root, folder);
        Err(VaultError::new(ErrorKind::Io, "Import PowerPoint on a Windows computer with PowerPoint installed, or import a PDF instead."))
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use std::process::{Command, Stdio};
        use std::time::{Duration, Instant};
        let imported = import_file(root, source, folder)?;
        let input = path_guard::resolve(root, &imported)?;
        let directory = path_guard::resolve(root, folder)?;
        let mut child = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                include_str!("powerpoint-import.ps1"),
            ])
            .env("BENCHWORK_IMPORT_SOURCE", path_guard::display_path(&input))
            .env(
                "BENCHWORK_IMPORT_DEST",
                path_guard::display_path(&directory),
            )
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| VaultError::io("Cannot start PowerPoint import", &e))?;
        let start = Instant::now();
        let status = loop {
            if let Some(status) = child
                .try_wait()
                .map_err(|e| VaultError::io("Cannot finish import", &e))?
            {
                break status;
            }
            if start.elapsed() > Duration::from_secs(180) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(VaultError::new(ErrorKind::Io, "PowerPoint import timed out. Open the source in PowerPoint, then try again or import a PDF."));
            }
            std::thread::sleep(Duration::from_millis(100));
        };
        if !status.success() {
            return Err(VaultError::new(ErrorKind::Io, "PowerPoint could not import this file. Check that PowerPoint is installed and the source opens normally, or import a PDF instead."));
        }
        let text = fs::read_to_string(directory.join("slides.json"))
            .map_err(|e| VaultError::io("Cannot read imported slides", &e))?;
        let mut slides: Vec<SlideImage> = serde_json::from_str(text.trim_start_matches('\u{feff}'))
            .map_err(|_| {
                VaultError::new(ErrorKind::Io, "PowerPoint returned an invalid slide list")
            })?;
        if slides.is_empty() || slides.len() > 1000 {
            return Err(VaultError::new(
                ErrorKind::Io,
                "Import between 1 and 1000 slides",
            ));
        }
        for slide in &mut slides {
            if slide.image.contains(['/', '\\', ':'])
                || !slide.image.starts_with("slide-")
                || !slide.image.ends_with(".png")
            {
                return Err(VaultError::new(
                    ErrorKind::InvalidPath,
                    "Invalid imported slide filename",
                ));
            }
            let image = format!("{folder}/{}", slide.image);
            if !path_guard::resolve(root, &image)?.is_file() {
                return Err(VaultError::new(
                    ErrorKind::Io,
                    "An imported slide image is missing",
                ));
            }
            slide.image = image;
        }
        Ok(ImportedSlides {
            source: imported,
            slides,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn imports_to_new_folders_without_overwriting_or_touching_source() {
        let temp = tempfile::tempdir().unwrap();
        let root = path_guard::canonical_root(temp.path()).unwrap();
        let original = tempfile::tempdir().unwrap();
        let file = original.path().join("notes.pdf");
        fs::write(&file, b"pdf").unwrap();
        let path = import_file(&root, &file, "Teaching/Assets/one").unwrap();
        assert_eq!(fs::read(root.join(path)).unwrap(), b"pdf");
        assert_eq!(fs::read(&file).unwrap(), b"pdf");
        assert!(import_file(&root, &file, "Teaching/Assets/one").is_err());
        assert!(import_file(&root, &file, "../outside").is_err());
    }
    #[cfg(windows)]
    #[test]
    #[ignore = "Requires installed PowerPoint and BENCHWORK_TEST_PPTX fixture"]
    fn real_powerpoint_import() {
        let source = std::path::PathBuf::from(
            std::env::var("BENCHWORK_TEST_PPTX").expect("Set fixture path"),
        );
        let before = fs::read(&source).unwrap();
        let temp = tempfile::tempdir().unwrap();
        let root = path_guard::canonical_root(temp.path()).unwrap();
        let imported = import_powerpoint(&root, &source, "Teaching/Assets/real").unwrap();
        assert_eq!(imported.slides.len(), 2);
        assert_eq!(imported.slides[0].title, "Public title");
        assert!(imported.slides[0].notes.contains("PRIVATE TEST NOTES"));
        for slide in imported.slides {
            let bytes = fs::read(root.join(slide.image)).unwrap();
            assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
        }
        assert_eq!(fs::read(source).unwrap(), before);
    }
}
