mod audience;
mod backup;
mod error;
mod file_info;
mod folders;
mod index;
mod materials;
mod microsoft;
mod native_sync;
mod pandoc;
mod path_guard;
mod programs;
mod storage;
mod vault_fs;
mod vault_root;
mod watcher;
mod web_link;

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
    /// Programs running for modules, by run id, each with its stop flag.
    runs: Mutex<std::collections::HashMap<String, std::sync::Arc<std::sync::atomic::AtomicBool>>>,
}

fn unavailable() -> VaultError {
    VaultError::new(ErrorKind::Io, "Vault state is unavailable")
}

fn main_window(window: &tauri::WebviewWindow) -> VaultResult<()> {
    if window.label() != "main" {
        return Err(VaultError::new(
            ErrorKind::Io,
            "This command is for the presenter window",
        ));
    }
    Ok(())
}
#[tauri::command]
async fn native_sync_start(
    app: AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, VaultState>,
    sync: State<'_, native_sync::NativeSync>,
    ip: String,
    other_sync_stopped: bool,
) -> Result<native_sync::HostStatus, String> {
    main_window(&window).map_err(|e| e.message)?;
    sync.start(
        state.root().map_err(|e| e.message)?,
        app.path().app_config_dir().map_err(|e| e.to_string())?,
        ip,
        other_sync_stopped,
    )
    .await
}
#[tauri::command]
async fn native_sync_stop(
    window: tauri::WebviewWindow,
    sync: State<'_, native_sync::NativeSync>,
) -> Result<(), String> {
    main_window(&window).map_err(|e| e.message)?;
    sync.stop().await
}
#[tauri::command]
fn native_sync_status(
    window: tauri::WebviewWindow,
    sync: State<'_, native_sync::NativeSync>,
) -> Result<native_sync::HostStatus, String> {
    main_window(&window).map_err(|e| e.message)?;
    sync.status()
}
#[tauri::command]
fn native_sync_ip(window: tauri::WebviewWindow) -> Result<String, String> {
    main_window(&window).map_err(|e| e.message)?;
    Ok(native_sync::local_ip())
}
#[tauri::command]
fn native_sync_invitation(
    window: tauri::WebviewWindow,
    sync: State<'_, native_sync::NativeSync>,
) -> Result<native_sync::Pairing, String> {
    main_window(&window).map_err(|e| e.message)?;
    sync.invitation()
}
#[tauri::command]
fn native_sync_revoke(
    window: tauri::WebviewWindow,
    sync: State<'_, native_sync::NativeSync>,
) -> Result<(), String> {
    main_window(&window).map_err(|e| e.message)?;
    sync.revoke_all()
}
#[tauri::command]
async fn native_sync_join(
    window: tauri::WebviewWindow,
    invitation: native_sync::Invitation,
    name: String,
) -> Result<native_sync::Connection, String> {
    main_window(&window).map_err(|e| e.message)?;
    native_sync::join(invitation, name).await
}
#[tauri::command]
async fn native_sync_run(
    window: tauri::WebviewWindow,
    state: State<'_, VaultState>,
    sync: State<'_, native_sync::NativeSync>,
    connection: native_sync::Connection,
    other_sync_stopped: bool,
) -> Result<native_sync::Report, String> {
    main_window(&window).map_err(|e| e.message)?;
    sync.sync(
        state.root().map_err(|e| e.message)?,
        connection,
        other_sync_stopped,
    )
    .await
}
#[tauri::command]
fn native_sync_read_invitation(
    window: tauri::WebviewWindow,
    source: String,
) -> Result<native_sync::Invitation, String> {
    main_window(&window).map_err(|e| e.message)?;
    let file = std::fs::File::open(source).map_err(|_| "Cannot open the pairing file")?;
    use std::io::Read;
    let mut text = String::new();
    file.take(16001)
        .read_to_string(&mut text)
        .map_err(|_| "Cannot read pairing details")?;
    if text.len() > 16000 {
        return Err("Pairing file is too large".into());
    }
    serde_json::from_str(&text).map_err(|_| "Choose a BenchWork pairing JSON file".into())
}
#[tauri::command]
fn native_sync_export_invitation(
    app: AppHandle,
    window: tauri::WebviewWindow,
    text: String,
) -> Result<String, String> {
    main_window(&window).map_err(|e| e.message)?;
    if text.len() > 16000 {
        return Err("Invalid pairing details".into());
    }
    let _: native_sync::Invitation =
        serde_json::from_str(&text).map_err(|_| "Invalid pairing details")?;
    let directory = app
        .path()
        .download_dir()
        .map_err(|_| "Downloads folder unavailable")?;
    std::fs::create_dir_all(&directory).map_err(|_| "Cannot open Downloads")?;
    let path = directory.join(format!("BenchWork-pair-{}.json", rand::random::<u64>()));
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|_| "Cannot create pairing file")?;
    file.write_all(text.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|_| "Cannot save pairing file")?;
    Ok(path_guard::display_path(&path))
}
#[tauri::command]
async fn import_material_file(
    source: String,
    folder: String,
    window: tauri::WebviewWindow,
    state: State<'_, VaultState>,
) -> VaultResult<String> {
    main_window(&window)?;
    let root = state.root()?;
    tauri::async_runtime::spawn_blocking(move || {
        materials::import_file(&root, Path::new(&source), &folder)
    })
    .await
    .map_err(|e| VaultError::new(ErrorKind::Io, e.to_string()))?
}
#[tauri::command]
async fn import_powerpoint(
    source: String,
    folder: String,
    window: tauri::WebviewWindow,
    state: State<'_, VaultState>,
) -> VaultResult<materials::ImportedSlides> {
    main_window(&window)?;
    let root = state.root()?;
    tauri::async_runtime::spawn_blocking(move || {
        materials::import_powerpoint(&root, Path::new(&source), &folder)
    })
    .await
    .map_err(|e| VaultError::new(ErrorKind::Io, e.to_string()))?
}
#[tauri::command]
fn audience_monitors(
    app: AppHandle,
    window: tauri::WebviewWindow,
) -> VaultResult<Vec<audience::DisplayInfo>> {
    main_window(&window)?;
    audience::monitors(&app)
}
#[tauri::command]
async fn open_audience(
    app: AppHandle,
    window: tauri::WebviewWindow,
    frame: audience::Frame,
    monitor: usize,
) -> VaultResult<()> {
    main_window(&window)?;
    audience::open(&app, frame, monitor)
}
#[tauri::command]
fn update_audience(
    app: AppHandle,
    window: tauri::WebviewWindow,
    frame: audience::Frame,
) -> VaultResult<()> {
    main_window(&window)?;
    audience::update(&app, frame)
}
#[tauri::command]
fn close_audience(app: AppHandle, window: tauri::WebviewWindow) -> VaultResult<()> {
    main_window(&window)?;
    audience::close(&app)
}
#[tauri::command]
fn audience_ready(
    window: tauri::WebviewWindow,
    state: State<'_, audience::AudienceState>,
) -> VaultResult<Option<audience::Frame>> {
    if window.label() != "audience" {
        return Err(unavailable());
    }
    Ok(state.0.lock().map_err(|_| unavailable())?.clone())
}

#[tauri::command]
async fn copy_to_storage(
    id: String,
    source: String,
    folder: String,
    state: State<'_, VaultState>,
) -> VaultResult<storage::VerifiedCopy> {
    let root = state.root()?;
    let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    state
        .runs
        .lock()
        .map_err(|_| unavailable())?
        .insert(id.clone(), stop.clone());
    let transfer_id = id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        storage::copy(
            &root,
            Path::new(&source),
            Path::new(&folder),
            &transfer_id,
            &stop,
        )
    })
    .await
    .map_err(|e| VaultError::new(ErrorKind::Io, e.to_string()));
    state.runs.lock().map_err(|_| unavailable())?.remove(&id);
    result?
}

#[tauri::command]
async fn verify_storage_copy(copy: storage::VerifiedCopy) -> VaultResult<()> {
    tauri::async_runtime::spawn_blocking(move || storage::verify(&copy))
        .await
        .map_err(|e| VaultError::new(ErrorKind::Io, e.to_string()))?
}
#[tauri::command]
async fn reveal_storage_copy(copy: storage::VerifiedCopy) -> VaultResult<()> {
    storage::reveal(&copy)
}
#[tauri::command]
async fn recycle_storage_source(copy: storage::VerifiedCopy) -> VaultResult<()> {
    tauri::async_runtime::spawn_blocking(move || storage::recycle_source(&copy))
        .await
        .map_err(|e| VaultError::new(ErrorKind::Io, e.to_string()))?
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

/// Backs the open vault up into `folder` as a dated zip, then puts away
/// older backups beyond the newest `keep`.
#[tauri::command]
async fn backup_vault(
    folder: String,
    name: String,
    stamp: String,
    keep: usize,
    state: State<'_, VaultState>,
) -> VaultResult<backup::BackupFile> {
    let root = state.root()?;
    let folder = PathBuf::from(folder);
    let made = backup::backup_vault(&root, &folder, &name, &stamp)?;
    for old in backup::surplus(&backup::list_backups(&folder, &name)?, keep) {
        put_away_backup(&old)?;
    }
    Ok(made)
}

/// An old backup beyond the number to keep: to the Recycle Bin, where there is one.
#[cfg(not(target_os = "android"))]
fn put_away_backup(path: &Path) -> VaultResult<()> {
    trash::delete(path)
        .map_err(|e| VaultError::new(ErrorKind::Io, format!("Cannot put an old backup away: {e}")))
}

#[cfg(target_os = "android")]
fn put_away_backup(path: &Path) -> VaultResult<()> {
    std::fs::remove_file(path).map_err(|e| VaultError::io("Cannot put an old backup away", &e))
}

/// Backups of the vault named `name` in `folder`, oldest first.
#[tauri::command]
async fn list_backups(folder: String, name: String) -> VaultResult<Vec<backup::BackupFile>> {
    backup::list_backups(Path::new(&folder), &name)
}

/// Unpacks a backup into a new folder beside it, and returns that folder.
#[tauri::command]
async fn restore_backup(path: String) -> VaultResult<String> {
    backup::restore_backup(Path::new(&path))
}

/// Runs a program for a module, with vault paths in `args` made full,
/// in the vault folder `cwd`. Resolves when it ends or is stopped.
#[tauri::command]
async fn run_program(
    id: String,
    program: String,
    args: Vec<programs::Arg>,
    cwd: String,
    state: State<'_, VaultState>,
) -> VaultResult<programs::RunResult> {
    let root = state.root()?;
    let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    state
        .runs
        .lock()
        .map_err(|_| unavailable())?
        .insert(id.clone(), stop.clone());
    let result = tauri::async_runtime::spawn_blocking(move || {
        programs::run(&root, &program, &args, &cwd, &stop)
    })
    .await
    .map_err(|e| VaultError::new(ErrorKind::Io, format!("The run failed: {e}")))?;
    state.runs.lock().map_err(|_| unavailable())?.remove(&id);
    result
}

/// Copies the main script into a new, size-limited vault snapshot.
#[tauri::command]
async fn snapshot_program_file(
    source: String,
    destination: String,
    state: State<'_, VaultState>,
) -> VaultResult<String> {
    let root = state.root()?;
    let full = if Path::new(&source).is_absolute() {
        PathBuf::from(&source)
    } else {
        path_guard::resolve(&root, &source)?
    };
    tauri::async_runtime::spawn_blocking(move || {
        vault_fs::copy_in(&root, &full, &destination, 4 * 1024 * 1024)?;
        file_info::sha256(&path_guard::resolve(&root, &destination)?)
    })
    .await
    .map_err(|e| VaultError::new(ErrorKind::Io, format!("The script snapshot failed: {e}")))?
}

/// Stops a program started with run_program.
#[tauri::command]
async fn stop_program(id: String, state: State<'_, VaultState>) -> VaultResult<()> {
    if let Some(stop) = state.runs.lock().map_err(|_| unavailable())?.get(&id) {
        stop.store(true, std::sync::atomic::Ordering::SeqCst);
    }
    Ok(())
}

/// Opens a vault file in the program the system uses for it.
#[tauri::command]
async fn open_vault_file(path: String, state: State<'_, VaultState>) -> VaultResult<()> {
    let full = path_guard::resolve(&state.root()?, &path)?;
    web_link::open_file(&full)
}

/// Opens a web address in the system's browser.
#[tauri::command]
async fn open_web_link(url: String) -> VaultResult<()> {
    web_link::open(&url)
}

/// Folders inside a full path, for choosing a vault inside the app.
#[tauri::command]
async fn list_folders(path: String) -> VaultResult<Vec<String>> {
    folders::list_folders(Path::new(&path))
}

/// Makes a new folder at a full path, for a new vault chosen inside the app.
#[tauri::command]
async fn make_folder(path: String) -> VaultResult<()> {
    folders::make_folder(Path::new(&path))
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

/// Pandoc's version, or null if it is not installed.
#[tauri::command]
async fn pandoc_version() -> VaultResult<Option<String>> {
    Ok(pandoc::version())
}

/// Turns Markdown into a Word file in the vault with Pandoc.
#[tauri::command]
async fn pandoc_to_word(
    markdown: String,
    output: String,
    bibliography: Option<String>,
    csl: Option<String>,
    state: State<'_, VaultState>,
) -> VaultResult<()> {
    pandoc::to_word(
        &state.root()?,
        &markdown,
        &output,
        bibliography.as_deref(),
        csl.as_deref(),
    )
}

#[tauri::command]
async fn remove_snapshot(path: String, state: State<'_, VaultState>) -> VaultResult<()> {
    vault_fs::remove_snapshot(&state.root()?, &path)
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

/// A vault path, or with `external` a full path outside the vault (a linked
/// file the user chose).
fn file_path(state: &VaultState, path: &str, external: bool) -> VaultResult<PathBuf> {
    if external {
        Ok(PathBuf::from(path))
    } else {
        path_guard::resolve(&state.root()?, path)
    }
}

#[tauri::command]
async fn file_info(
    path: String,
    external: bool,
    state: State<'_, VaultState>,
) -> VaultResult<file_info::FileInfo> {
    file_info::file_info(&file_path(&state, &path, external)?)
}

/// Hashes on a blocking thread: a linked data file can take minutes.
#[tauri::command]
async fn hash_file(
    path: String,
    external: bool,
    state: State<'_, VaultState>,
) -> VaultResult<String> {
    let full = file_path(&state, &path, external)?;
    tauri::async_runtime::spawn_blocking(move || file_info::sha256(&full))
        .await
        .map_err(|_| VaultError::new(ErrorKind::Io, "Checking the file stopped unexpectedly"))?
}

/// The bytes of a vault file, sent back raw rather than as JSON.
#[tauri::command]
async fn read_bytes(
    path: String,
    max_bytes: u64,
    state: State<'_, VaultState>,
) -> VaultResult<tauri::ipc::Response> {
    let data = vault_fs::read_bytes(&state.root()?, &path, max_bytes)?;
    Ok(tauri::ipc::Response::new(data))
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

/// The bytes of a `write_bytes` request. They normally come as the raw
/// body. If the webview could not use Tauri's IPC protocol, Tauri falls back
/// to sending them as a JSON list of numbers, which is accepted too.
fn body_bytes(body: &tauri::ipc::InvokeBody) -> Option<std::borrow::Cow<'_, [u8]>> {
    match body {
        tauri::ipc::InvokeBody::Raw(data) => Some(std::borrow::Cow::Borrowed(data)),
        tauri::ipc::InvokeBody::Json(serde_json::Value::Array(items)) => items
            .iter()
            .map(|v| v.as_u64().and_then(|n| u8::try_from(n).ok()))
            .collect::<Option<Vec<u8>>>()
            .map(std::borrow::Cow::Owned),
        tauri::ipc::InvokeBody::Json(_) => None,
    }
}

/// Writes binary data, sent as the request body so images are not turned
/// into text. The vault path is in the `x-vault-path` header.
#[tauri::command]
async fn write_bytes(
    request: tauri::ipc::Request<'_>,
    state: State<'_, VaultState>,
) -> VaultResult<()> {
    let data = body_bytes(request.body())
        .ok_or_else(|| VaultError::new(ErrorKind::Io, "The file's data did not arrive"))?;
    let path = request
        .headers()
        .get("x-vault-path")
        .and_then(|v| v.to_str().ok())
        .and_then(percent_decode)
        .ok_or_else(|| VaultError::new(ErrorKind::InvalidPath, "Missing x-vault-path header"))?;
    vault_fs::write_bytes_atomic(&state.root()?, &path, &data)
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

#[tauri::command]
async fn microsoft_request(request: microsoft::Request) -> VaultResult<microsoft::Response> {
    microsoft::request(request).await
}
#[tauri::command]
async fn secure_read(app: AppHandle, key: String) -> VaultResult<Option<String>> {
    let root = app.path().app_config_dir().map_err(|_| unavailable())?;
    microsoft::read(&root, &key)
}
#[tauri::command]
async fn secure_write(app: AppHandle, key: String, value: Option<String>) -> VaultResult<()> {
    let root = app.path().app_config_dir().map_err(|_| unavailable())?;
    microsoft::write(&root, &key, value)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Explicit local setup command; no remote URL or protocol handler can enable hosting.
            let args: Vec<String> = std::env::args().collect();
            if let Some(index) = args.iter().position(|a| a == "--host-sync-vault") {
                let folder = args
                    .get(index + 1)
                    .ok_or("Pass a local vault folder after --host-sync-vault")?;
                let root = path_guard::canonical_root(Path::new(folder))?;
                if !root.join(".benchwork/config.json").is_file() {
                    return Err("Choose an existing BenchWork vault".into());
                }
                native_sync::check_engine(&root, false).map_err(std::io::Error::other)?;
                let config = app.path().app_config_dir()?;
                let ip = native_sync::local_ip();
                let sync = app.state::<native_sync::NativeSync>();
                tauri::async_runtime::block_on(sync.start(
                    root.clone(),
                    config.clone(),
                    ip.clone(),
                    false,
                ))
                .map_err(std::io::Error::other)?;
                let display = path_guard::display_path(&root);
                let device_key = format!(
                    "native-sync-{}",
                    native_sync::files::hash(display.as_bytes())
                );
                microsoft::write(
                    &config,
                    &device_key,
                    Some(serde_json::json!({"mode":"host","ip":ip}).to_string()),
                )?;
                let settings_file = config.join(APP_SETTINGS_FILE);
                let mut settings: serde_json::Value = if settings_file.exists() {
                    serde_json::from_slice(&std::fs::read(&settings_file)?)?
                } else {
                    serde_json::json!({})
                };
                settings["lastVault"] = display.into();
                vault_fs::write_atomic(&settings_file, &serde_json::to_vec(&settings)?)?;
                let invitation = sync.invitation().map_err(std::io::Error::other)?;
                let downloads = app.path().download_dir()?;
                std::fs::create_dir_all(&downloads)?;
                let pairing_file = downloads.join(format!(
                    "BenchWork-pair-setup-{}.json",
                    rand::random::<u64>()
                ));
                use std::io::Write;
                let mut file = std::fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(pairing_file)?;
                file.write_all(invitation.text.as_bytes())?;
                file.sync_all()?;
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .manage(VaultState::default())
        .manage(audience::AudienceState::default())
        .manage(native_sync::NativeSync::default())
        .invoke_handler(tauri::generate_handler![
            native_sync_read_invitation,
            native_sync_export_invitation,
            native_sync_start,
            native_sync_stop,
            native_sync_status,
            native_sync_ip,
            native_sync_invitation,
            native_sync_revoke,
            native_sync_join,
            native_sync_run,
            import_material_file,
            import_powerpoint,
            audience_monitors,
            open_audience,
            update_audience,
            close_audience,
            audience_ready,
            microsoft_request,
            secure_read,
            secure_write,
            set_vault_root,
            find_vault_root,
            list_folders,
            make_folder,
            backup_vault,
            run_program,
            copy_to_storage,
            verify_storage_copy,
            reveal_storage_copy,
            recycle_storage_source,
            snapshot_program_file,
            stop_program,
            open_web_link,
            open_vault_file,
            list_backups,
            restore_backup,
            list_dir,
            read_text,
            write_text_atomic,
            ensure_dir,
            exists,
            create_new,
            rename,
            trash,
            remove_snapshot,
            pandoc_version,
            pandoc_to_word,
            copy_in,
            write_bytes,
            read_bytes,
            file_info,
            hash_file,
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
    use super::{body_bytes, percent_decode};
    use tauri::ipc::InvokeBody;

    #[test]
    fn accepts_bytes_raw_or_as_a_json_list() {
        let raw = InvokeBody::Raw(vec![137, 80, 78, 71]);
        assert_eq!(body_bytes(&raw).as_deref(), Some(&[137u8, 80, 78, 71][..]));
        let json = InvokeBody::Json(serde_json::json!([137, 80, 78, 71]));
        assert_eq!(body_bytes(&json).as_deref(), Some(&[137u8, 80, 78, 71][..]));
        for bad in [
            serde_json::json!([256]),
            serde_json::json!([-1]),
            serde_json::json!({"a": 1}),
        ] {
            assert!(body_bytes(&InvokeBody::Json(bad)).is_none());
        }
    }

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
