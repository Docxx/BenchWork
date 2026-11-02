//! Opening web addresses in the system's browser, and files in their usual program.

use std::process::Command;

use crate::error::{ErrorKind, VaultError, VaultResult};

/// Whether `url` is a plain web address: http or https, with no spaces,
/// quotes or control characters that a launcher might read as more.
pub fn is_web_link(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    (lower.starts_with("https://") || lower.starts_with("http://"))
        && url.len() < 4096
        && !url.chars().any(|c| {
            c.is_whitespace()
                || c.is_control()
                || matches!(c, '"' | '\'' | '<' | '>' | '`' | '^' | '|')
        })
}

/// Opens `url` in the default browser.
pub fn open(url: &str) -> VaultResult<()> {
    if !is_web_link(url) {
        return Err(VaultError::new(
            ErrorKind::InvalidPath,
            "That is not a web address",
        ));
    }
    launch_url(url)
}

fn launch_url(url: &str) -> VaultResult<()> {
    let mut command = if cfg!(target_os = "windows") {
        let mut c = Command::new("rundll32");
        c.args(["url.dll,FileProtocolHandler", url]);
        c
    } else if cfg!(target_os = "macos") {
        let mut c = Command::new("open");
        c.arg(url);
        c
    } else {
        let mut c = Command::new("xdg-open");
        c.arg(url);
        c
    };
    command
        .spawn()
        .map(|_| ())
        .map_err(|e| VaultError::io("Cannot open the browser", &e))
}

fn component(text: &str) -> String {
    text.as_bytes()
        .iter()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"-._~".contains(b) {
                (*b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}
pub fn feedback_link(subject: &str, body: &str) -> VaultResult<String> {
    if subject.len() > 512 || subject.chars().any(char::is_control) || body.len() > 16000 {
        return Err(VaultError::new(
            ErrorKind::InvalidPath,
            "Copy the report and paste it into your email app.",
        ));
    }
    let url = format!(
        "mailto:raywprice@gmail.com?subject={}&body={}",
        component(subject),
        component(body)
    );
    if url.len() > 6000 {
        return Err(VaultError::new(
            ErrorKind::InvalidPath,
            "This report is too long for an email link. Copy it into your email app instead.",
        ));
    }
    Ok(url)
}
/// Opens a draft to the fixed feedback inbox. No SMTP, account credentials or sending.
pub fn open_feedback_email(subject: &str, body: &str) -> VaultResult<()> {
    launch_url(&feedback_link(subject, body)?)
}

/// Opens an existing folder in the system's file manager.
pub fn open_folder(full: &std::path::Path) -> VaultResult<()> {
    let folder = crate::path_guard::canonical_root(full)?;
    let program = if cfg!(target_os = "windows") {
        "explorer.exe"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    Command::new(program)
        .arg(folder)
        .spawn()
        .map(|_| ())
        .map_err(|e| VaultError::io("Cannot open the folder", &e))
}

/// Opens a file in the program the system uses for it, such as Word for `.docx`.
pub fn open_file(full: &std::path::Path) -> VaultResult<()> {
    if !full.is_file() {
        return Err(VaultError::new(
            ErrorKind::NotFound,
            "That file could not be found",
        ));
    }
    let mut command = if cfg!(target_os = "windows") {
        let mut c = Command::new("explorer");
        c.arg(full);
        c
    } else if cfg!(target_os = "macos") {
        let mut c = Command::new("open");
        c.arg(full);
        c
    } else {
        let mut c = Command::new("xdg-open");
        c.arg(full);
        c
    };
    command
        .spawn()
        .map(|_| ())
        .map_err(|e| VaultError::io("Cannot open the file", &e))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn folder_open_rejects_files_and_missing_locations_before_launch() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("data.txt");
        std::fs::write(&file, "data").unwrap();
        assert!(open_folder(&file).is_err());
        assert!(open_folder(&temp.path().join("missing")).is_err());
    }
    #[test]
    fn feedback_has_one_fixed_recipient_and_encodes_report_text_as_data() {
        let link = feedback_link("Bug & question?", "Text\r\n&bcc=other@example.com").unwrap();
        assert!(
            link.starts_with("mailto:raywprice@gmail.com?subject=Bug%20%26%20question%3F&body=")
        );
        assert!(link.contains("%26bcc%3Dother%40example.com"));
        assert!(feedback_link("Bug\r\nBcc: other@example.com", "body").is_err());
        assert!(feedback_link("Title", &"a".repeat(16001)).is_err());
    }

    #[test]
    fn accepts_only_plain_web_addresses() {
        assert!(is_web_link("https://doi.org/10.1016/j.gene.2026.150431"));
        assert!(is_web_link(
            "http://europepmc.org/abstract/MED/42822610?x=1&y=2"
        ));
        assert!(!is_web_link("file:///C:/Windows/System32/calc.exe"));
        assert!(!is_web_link("https://x.org/a b"));
        assert!(!is_web_link("https://x.org/\"&calc"));
        assert!(!is_web_link("javascript:alert(1)"));
        assert!(!is_web_link("C:\\Windows\\notepad.exe"));
    }
}
