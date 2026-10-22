mod error;
mod path_guard;
mod vault_fs;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

use error::{ErrorKind, VaultError, VaultResult};
use vault_fs::DirEntry;

/// The canonical root of the open vault. File commands fail until it is set.
#[derive(Default)]
struct VaultState(Mutex<Option<PathBuf>>);

impl VaultState {
    fn root(&self) -> VaultResult<PathBuf> {
        self.0
            .lock()
            .map_err(|_| VaultError::new(ErrorKind::Io, "Vault state is unavailable"))?
            .clone()
            .ok_or_else(|| VaultError::new(ErrorKind::NoVault, "No vault is open"))
    }
}

/// Opens a folder as the vault root and returns its full path for display.
#[tauri::command]
async fn set_vault_root(root: String, state: State<'_, VaultState>) -> VaultResult<String> {
    let canon = path_guard::canonical_root(Path::new(&root))?;
    let display = path_guard::display_path(&canon);
    *state
        .0
        .lock()
        .map_err(|_| VaultError::new(ErrorKind::Io, "Vault state is unavailable"))? = Some(canon);
    Ok(display)
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
    vault_fs::write_atomic(&path, &text)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(VaultState::default())
        .invoke_handler(tauri::generate_handler![
            set_vault_root,
            list_dir,
            read_text,
            write_text_atomic,
            ensure_dir,
            exists,
            load_app_settings,
            save_app_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running BenchWork");
}
