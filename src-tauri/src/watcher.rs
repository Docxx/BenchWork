//! Watches the open vault and tells the front end which paths changed, so
//! the sidebar, open pages and search index can follow edits made outside
//! BenchWork (File Explorer, OneDrive, Syncthing). If watching fails, for
//! example on some network drives, the app still works with manual refresh.

use std::collections::BTreeSet;
use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use notify_debouncer_full::notify::{EventKind, RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::path_guard::normalise;

pub type VaultWatcher = Debouncer<RecommendedWatcher, RecommendedCache>;

pub const CHANGE_EVENT: &str = "vault-change";

/// Sent to the front end. `root` lets it ignore events from a vault it has
/// since closed.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct VaultChange {
    pub root: String,
    /// Vault-relative paths with `/` separators, sorted, no duplicates.
    pub paths: Vec<String>,
}

/// `C:\Vault\Notes\a.md` under `C:\Vault` → `Notes/a.md`. None if outside
/// the root, the root itself, or a name the path rules would reject.
pub fn relative(root: &Path, path: &Path) -> Option<String> {
    let rest = path.strip_prefix(root).ok()?;
    let mut parts = Vec::new();
    for component in rest.components() {
        match component {
            Component::Normal(name) => parts.push(name.to_str()?.to_string()),
            _ => return None,
        }
    }
    if parts.is_empty() {
        return None;
    }
    normalise(&parts.join("/")).ok()
}

/// Changes the front end never needs to hear about: BenchWork's own files
/// (except the vault config) and the temporary files used for safe saving.
/// Whether an event is a change. Opening and reading a file are not: Linux
/// and Android report them, and reading pages must not look like editing them.
pub fn is_change(kind: &EventKind) -> bool {
    !matches!(kind, EventKind::Access(_))
}

pub fn ignored(rel: &str) -> bool {
    if rel == ".benchwork" || (rel.starts_with(".benchwork/") && rel != ".benchwork/config.json") {
        return true;
    }
    let name = rel.rsplit('/').next().unwrap_or(rel);
    name.starts_with('.') && name.ends_with(".tmp")
}

/// Starts watching `root` (canonical). Events are grouped over 300 ms.
pub fn start(
    app: AppHandle,
    root: PathBuf,
    display: String,
) -> notify_debouncer_full::notify::Result<VaultWatcher> {
    let watch_root = root.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(300),
        None,
        move |result: DebounceEventResult| {
            let Ok(events) = result else { return };
            let paths: BTreeSet<String> = events
                .iter()
                .filter(|e| is_change(&e.event.kind))
                .flat_map(|e| e.event.paths.iter())
                .filter_map(|p| relative(&watch_root, p))
                .filter(|rel| !ignored(rel))
                .collect();
            if paths.is_empty() {
                return;
            }
            let _ = app.emit(
                CHANGE_EVENT,
                VaultChange {
                    root: display.clone(),
                    paths: paths.into_iter().collect(),
                },
            );
        },
    )?;
    debouncer.watch(&root, RecursiveMode::Recursive)?;
    Ok(debouncer)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn makes_paths_relative_with_forward_slashes() {
        let root = Path::new("/vault");
        assert_eq!(
            relative(root, Path::new("/vault/Notes/Day 1.md")).as_deref(),
            Some("Notes/Day 1.md")
        );
        assert_eq!(relative(root, Path::new("/vault")), None);
        assert_eq!(relative(root, Path::new("/elsewhere/a.md")), None);
        assert_eq!(relative(root, Path::new("/vault/CON")), None);
    }

    #[cfg(windows)]
    #[test]
    fn handles_windows_paths() {
        let root = Path::new(r"\\?\C:\Vault");
        assert_eq!(
            relative(root, Path::new(r"\\?\C:\Vault\Notes\a.md")).as_deref(),
            Some("Notes/a.md")
        );
    }

    #[test]
    fn counts_writes_but_not_reads_as_changes() {
        use notify_debouncer_full::notify::event::{
            AccessKind, AccessMode, CreateKind, DataChange, ModifyKind,
        };
        assert!(!is_change(&EventKind::Access(AccessKind::Open(
            AccessMode::Read
        ))));
        assert!(!is_change(&EventKind::Access(AccessKind::Close(
            AccessMode::Read
        ))));
        assert!(is_change(&EventKind::Modify(ModifyKind::Data(
            DataChange::Content
        ))));
        assert!(is_change(&EventKind::Create(CreateKind::File)));
    }

    #[test]
    fn ignores_benchwork_internals_and_temp_files() {
        assert!(ignored(".benchwork"));
        assert!(ignored(".benchwork/index.sqlite"));
        assert!(ignored(".benchwork/modules/hello/state.json"));
        assert!(!ignored(".benchwork/config.json"));
        assert!(ignored("Notes/.Day 1.md.1234.0.tmp"));
        assert!(!ignored("Notes/Day 1.md"));
        assert!(!ignored("Notes/.hidden.md"));
    }

    #[test]
    fn reports_real_changes_on_disk() {
        use std::sync::mpsc;

        let dir = tempfile::tempdir().unwrap();
        let root = crate::path_guard::canonical_root(dir.path()).unwrap();
        let (tx, rx) = mpsc::channel::<Vec<String>>();
        let watch_root = root.clone();
        let mut debouncer = new_debouncer(
            Duration::from_millis(100),
            None,
            move |result: DebounceEventResult| {
                if let Ok(events) = result {
                    let paths: BTreeSet<String> = events
                        .iter()
                        .flat_map(|e| e.event.paths.iter())
                        .filter_map(|p| relative(&watch_root, p))
                        .filter(|rel| !ignored(rel))
                        .collect();
                    if !paths.is_empty() {
                        let _ = tx.send(paths.into_iter().collect());
                    }
                }
            },
        )
        .unwrap();
        debouncer.watch(&root, RecursiveMode::Recursive).unwrap();

        std::fs::create_dir(root.join("Notes")).unwrap();
        std::fs::write(root.join("Notes").join("a.md"), "x").unwrap();

        let mut seen = BTreeSet::new();
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while !seen.contains("Notes/a.md") && std::time::Instant::now() < deadline {
            if let Ok(batch) = rx.recv_timeout(Duration::from_millis(200)) {
                seen.extend(batch);
            }
        }
        assert!(seen.contains("Notes/a.md"), "saw {seen:?}");
    }
}
