//! Opening web addresses in the system's browser.

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

#[cfg(test)]
mod tests {
    use super::*;

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
