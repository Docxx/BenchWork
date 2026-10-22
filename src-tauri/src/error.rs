use serde::Serialize;

/// Error kinds shared with the TypeScript `PlatformErrorKind` union.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ErrorKind {
    NoVault,
    InvalidPath,
    OutsideVault,
    NotFound,
    NotADirectory,
    NotAFile,
    /// The target of a create, rename or copy is already there.
    AlreadyExists,
    /// A file is bigger than the caller allowed.
    TooLarge,
    Io,
}

/// Serialised to the front end as `{ "kind": "...", "message": "..." }`.
#[derive(Debug, Clone, Serialize)]
pub struct VaultError {
    pub kind: ErrorKind,
    pub message: String,
}

impl VaultError {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub fn io(context: &str, err: &std::io::Error) -> Self {
        let kind = match err.kind() {
            std::io::ErrorKind::NotFound => ErrorKind::NotFound,
            std::io::ErrorKind::AlreadyExists => ErrorKind::AlreadyExists,
            _ => ErrorKind::Io,
        };
        Self::new(kind, format!("{context}: {err}"))
    }
}

impl std::fmt::Display for VaultError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}: {}", self.kind, self.message)
    }
}

impl std::error::Error for VaultError {}

pub type VaultResult<T> = Result<T, VaultError>;
