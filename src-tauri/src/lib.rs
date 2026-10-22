mod error;
mod index;
mod path_guard;
mod vault_fs;
mod vault_root;
mod watcher;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

use error::{ErrorKind, VaultError, VaultResult};
use vault_fs::DirEntry;

/// The open vault: its canonical root, the watcher reporting changes in it,
/// and its search index once opened. File commands fail until a root is set.
#[derive(Default)]
struct VaultState {
    root: Mutex<Option<PathBuf>>,
    watcher: Mutex<Option<watcher::VaultWatcher>>,
    index: Mutex<Option<index::SearchIndex>>,
}

fn unavailable() -> VaultError {
    VaultError::new(ErrorKind::Io, "Vault state is unavailable")
}

impl VaultState {
    fn root(&self) -> VaultResult<PathBuf> {
        self.root
            .lock()
            .map_err(|_| unavailable())?
            .clone()
            .ok_or_else(|| VaultError::new(ErrorKind::NoVault, "No vault is open"))
    }
}

/// Opens a folder as the vault root and returns its full path for display.
/// Also lets pages show the vault's images, and starts watching for changes.
#[tauri::command]
async fn set_vault_root(
    root: String,
    app: AppHandle,
    state: State<'_, VaultState>,
) -> VaultResult<String> {
    let canon = path_guard::canonical_root(Path::new(&root))?;
    let display = path_guard::display_path(&canon);

    // The asset protocol serves files for <img> tags. Vaults opened earlier
    // in the session stay allowed; Tauri has no way to withdraw a directory
    // without blocking it for good.
    app.asset_protocol_scope()
        .allow_directory(Path::new(&display), true)
        .map_err(|e| VaultError::new(ErrorKind::Io, format!("Cannot allow vault images: {e}")))?;

    // Replacing the old watcher drops it, which stops it.
    let new_watcher = match watcher::start(app.clone(), canon.clone(), display.clone()) {
        Ok(w) => Some(w),
        Err(e) => {
            eprintln!("Not watching {display} for changes: {e}");
            None
        }
    };
    *state.watcher.lock().map_err(|_| unavailable())? = new_watcher;
    // The previous vault's index closes; the front end opens the new one.
    *state.index.lock().map_err(|_| unavailable())? = None;
    *state.root.lock().map_err(|_| unavailable())? = Some(canon);
    Ok(display)
}

/// Runs `f` with the open vault's search index.
fn with_index<T>(
    state: &VaultState,
    f: impl FnOnce(&mut index::SearchIndex) -> VaultResult<T>,
) -> VaultResult<T> {
    let mut guard = state.index.lock().map_err(|_| unavailable())?;
    let index = guard
        .as_mut()
        .ok_or_else(|| VaultError::new(ErrorKind::NoVault, "The search index is not open"))?;
    f(index)
}

/// Opens `.benchwork/index.sqlite` in the open vault, creating it if needed.
#[tauri::command]
async fn index_open(state: State<'_, VaultState>) -> VaultResult<index::OpenInfo> {
    let root = state.root()?;
    let file = root.join(".benchwork").join("index.sqlite");
    let (opened, info) = index::SearchIndex::open(&file)?;
    *state.index.lock().map_err(|_| unavailable())? = Some(opened);
    Ok(info)
}

#[tauri::command]
async fn index_close(state: State<'_, VaultState>) -> VaultResult<()> {
    *state.index.lock().map_err(|_| unavailable())? = None;
    Ok(())
}

#[tauri::command]
async fn index_entries(state: State<'_, VaultState>) -> VaultResult<Vec<index::IndexEntry>> {
    with_index(&state, |i| i.entries())
}

#[tauri::command]
async fn index_apply(
    upserts: Vec<index::IndexedPage>,
    removes: Vec<String>,
    state: State<'_, VaultState>,
) -> VaultResult<()> {
    with_index(&state, |i| i.apply(&upserts, &removes))
}

#[tauri::command]
async fn index_clear(state: State<'_, VaultState>) -> VaultResult<()> {
    with_index(&state, |i| i.clear())
}

#[tauri::command]
async fn index_search(
    query: String,
    limit: usize,
    state: State<'_, VaultState>,
) -> VaultResult<Vec<index::SearchHit>> {
    with_index(&state, |i| i.search(&query, limit.min(200)))
}

#[tauri::command]
async fn index_backlinks(
    keys: Vec<String>,
    state: State<'_, VaultState>,
) -> VaultResult<Vec<index::LinkRef>> {
    with_index(&state, |i| i.backlinks(&keys))
}

#[tauri::command]
async fn index_pages(state: State<'_, VaultState>) -> VaultResult<Vec<index::PageRef>> {
    with_index(&state, |i| i.pages())
}

#[tauri::command]
async fn index_tags(state: State<'_, VaultState>) -> VaultResult<Vec<index::TagCount>> {
    with_index(&state, |i| i.tags())
}

#[tauri::command]
async fn index_tagged(
    tag: String,
    limit: usize,
    state: State<'_, VaultState>,
) -> VaultResult<Vec<index::SearchHit>> {
    with_index(&state, |i| i.tagged(&tag, limit.min(200)))
}

#[derive(serde::Serialize)]
struct VaultOwnerDto {
    root: String,
    folder: String,
    via: vault_root::Via,
}

/// The vault a chosen folder belongs to, or `null` if it is not in one.
#[tauri::command]
async fn find_vault_root(path: String) -> VaultResult<Option<VaultOwnerDto>> {
    Ok(
        vault_root::find_vault_root(Path::new(&path))?.map(|o| VaultOwnerDto {
            root: path_guard::display_path(&o.root),
            folder: path_guard::display_path(&o.folder),
            via: o.via,
        }),
    )
}

#[tauri::command]
async fn list_dir(path: String, state: State<'_, VaultState>) -> VaultResult<Vec<DirEntry>> {
    vault_fs::list_dir(&state.root()?, &path)
}

#[tauri::command]
async fn read_text(path: String, state: State<'_, VaultState>) -> VaultResult<String> {
    vault_fs::read_text(&state.root()?, &path)
}

#[tauri::command]
async fn write_text_atomic(
    path: String,
    text: String,
    state: State<'_, VaultState>,
) -> VaultResult<()> {
    vault_fs::write_text_atomic(&state.root()?, &path, &text)
}

#[tauri::command]
async fn ensure_dir(path: String, state: State<'_, VaultState>) -> VaultResult<()> {
    vault_fs::ensure_dir(&state.root()?, &path)
}

#[tauri::command]
async fn exists(path: String, state: State<'_, VaultState>) -> VaultResult<bool> {
    vault_fs::exists(&state.root()?, &path)
}

#[tauri::command]
async fn create_new(path: String, text: String, state: State<'_, VaultState>) -> VaultResult<()> {
    vault_fs::create_new(&state.root()?, &path, &text)
}

#[tauri::command]
async fn rename(from: String, to: String, state: State<'_, VaultState>) -> VaultResult<()> {
    vault_fs::rename(&state.root()?, &from, &to)
}

#[tauri::command]
async fn trash(path: String, state: State<'_, VaultState>) -> VaultResult<()> {
    vault_fs::trash(&state.root()?, &path)
}

/// `external` is a full path outside the vault, from a file the user dropped.
#[tauri::command]
async fn copy_in(
    external: String,
    to: String,
    max_bytes: u64,
    state: State<'_, VaultState>,
) -> VaultResult<u64> {
    vault_fs::copy_in(&state.root()?, Path::new(&external), &to, max_bytes)
}

/// Decodes `%XX` escapes from `encodeURIComponent`. Header values must be
/// ASCII, so the vault path travels encoded.
fn percent_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = std::str::from_utf8(bytes.get(i + 1..i + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// Writes binary data, sent as the raw request body so images are not
/// turned into JSON. The vault path is in the `x-vault-path` header.
#[tauri::command]
async fn write_bytes(
    request: tauri::ipc::Request<'_>,
    state: State<'_, VaultState>,
) -> VaultResult<()> {
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err(VaultError::new(ErrorKind::Io, "Expected raw bytes"));
    };
    let path = request
        .headers()
        .get("x-vault-path")
        .and_then(|v| v.to_str().ok())
        .and_then(percent_decode)
        .ok_or_else(|| VaultError::new(ErrorKind::InvalidPath, "Missing x-vault-path header"))?;
    vault_fs::write_bytes_atomic(&state.root()?, &path, data)
}

const APP_SETTINGS_FILE: &str = "settings.json";

fn app_settings_path(app: &AppHandle) -> VaultResult<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| VaultError::new(ErrorKind::Io, format!("No app config folder: {e}")))?;
    Ok(dir.join(APP_SETTINGS_FILE))
}

/// Per-device settings live in the app config folder, never in the vault.
/// Returns `null` when nothing has been saved yet.
#[tauri::command]
async fn load_app_settings(app: AppHandle) -> VaultResult<Option<serde_json::Value>> {
    let path = app_settings_path(&app)?;
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(VaultError::io("Cannot read app settings", &e)),
    };
    // A corrupt settings file falls back to defaults rather than blocking start-up.
    Ok(serde_json::from_str(&text).ok())
}

#[tauri::command]
async fn save_app_settings(app: AppHandle, settings: serde_json::Value) -> VaultResult<()> {
    let path = app_settings_path(&app)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|e| VaultError::io("Cannot create app config folder", &e))?;
    }
    let text = serde_json::to_string_pretty(&settings)
        .map_err(|e| VaultError::new(ErrorKind::Io, e.to_string()))?;
    vault_fs::write_atomic(&path, text.as_bytes())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(VaultState::default())
        .invoke_handler(tauri::generate_handler![
            set_vault_root,
            find_vault_root,
            list_dir,
            read_text,
            write_text_atomic,
            ensure_dir,
            exists,
            create_new,
            rename,
            trash,
            copy_in,
            write_bytes,
            load_app_settings,
            save_app_settings,
            index_open,
            index_close,
            index_entries,
            index_apply,
            index_clear,
            index_search,
            index_backlinks,
            index_pages,
            index_tags,
            index_tagged,
        ])
        .run(tauri::generate_context!())
        .expect("error while running BenchWork");
}

#[cfg(test)]
mod tests {
    use super::percent_decode;

    #[test]
    fn decodes_paths_from_encode_uri_component() {
        assert_eq!(
            percent_decode("attachments%2FPasted%20image%20%C3%A9t%C3%A9.png").as_deref(),
            Some("attachments/Pasted image été.png")
        );
        assert_eq!(percent_decode("plain.png").as_deref(), Some("plain.png"));
        assert_eq!(percent_decode("bad%2"), None);
        assert_eq!(percent_decode("bad%zz"), None);
    }
}
