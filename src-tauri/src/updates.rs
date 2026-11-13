//! User-triggered updates from Ray's pinned HTTPS update server.
//! Metadata, asset names, size and SHA-256 are checked natively. No redirects.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::Emitter;

const API: &str = "https://178.62.50.124/updates/latest.json";
const CERTIFICATE: &str = include_str!("../update-server.pem");
const MAX_INSTALLER: u64 = 800 * 1024 * 1024;
#[derive(Clone, Deserialize)]
struct Asset {
    name: String,
    size: u64,
    browser_download_url: String,
    digest: Option<String>,
}
#[derive(Deserialize)]
struct Release {
    tag_name: String,
    #[serde(default)]
    body: Option<String>,
    draft: bool,
    prerelease: bool,
    assets: Vec<Asset>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Available {
    pub version: String,
    pub notes: String,
    pub size: u64,
}
struct Ready {
    path: PathBuf,
    hash: String,
}
#[derive(Default)]
pub struct Updates {
    ready: Mutex<Option<Ready>>,
    gate: tokio::sync::Mutex<()>,
}
#[derive(Serialize)]
pub struct Installer {
    pub path: String,
    pub hash: String,
}

fn version(text: &str) -> Option<[u64; 3]> {
    let parts: Vec<_> = text.strip_prefix('v').unwrap_or(text).split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let mut result = [0; 3];
    for (i, part) in parts.iter().enumerate() {
        if part.is_empty()
            || !part.bytes().all(|b| b.is_ascii_digit())
            || (part.len() > 1 && part.starts_with('0'))
        {
            return None;
        }
        result[i] = part.parse().ok()?;
    }
    Some(result)
}
fn digest(asset: &Asset) -> Option<String> {
    let hash = asset.digest.as_ref()?.strip_prefix("sha256:")?;
    (hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit()))
        .then(|| hash.to_ascii_lowercase())
}
fn asset_url(text: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(text) else {
        return false;
    };
    url.scheme() == "https"
        && url.host_str() == Some("178.62.50.124")
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url.fragment().is_none()
        && url.query().is_none()
        && url.path().starts_with("/updates/")
}
fn select(
    release: Release,
    current: &str,
    android: bool,
    labels: bool,
) -> Result<Option<(Available, Asset)>, String> {
    let latest =
        version(&release.tag_name).ok_or("The release has an unsupported version number")?;
    let installed = version(current).ok_or("Cannot read the installed app version")?;
    if release.draft || release.prerelease || latest <= installed {
        return Ok(None);
    }
    let number = release.tag_name.trim_start_matches('v');
    let prefix = if labels {
        "BenchWork-Labels"
    } else {
        "BenchWork"
    };
    let names = if android {
        let mut names = vec![
            format!("{prefix}_{number}_arm64.apk"),
            format!("{prefix}_{number}_android-arm64.apk"),
        ];
        if !labels {
            names.extend([
                "app-universal-release.apk".into(),
                "app-universal-debug.apk".into(),
            ]);
        }
        names
    } else {
        vec![format!("{prefix}_{number}_x64-setup.exe")]
    };
    let asset = names.iter().find_map(|name| release.assets.iter().find(|asset| &asset.name == name)).cloned()
        .ok_or("The newer release has no installer for this device yet. Use the releases page or try again later.")?;
    if asset.size == 0
        || asset.size > MAX_INSTALLER
        || !asset_url(&asset.browser_download_url)
        || digest(&asset).is_none()
    {
        return Err(
            "The update has no valid checksum or download address. It was not installed.".into(),
        );
    }
    Ok(Some((
        Available {
            version: number.into(),
            notes: release
                .body
                .unwrap_or_default()
                .chars()
                .take(8000)
                .collect(),
            size: asset.size,
        },
        asset,
    )))
}
fn client(download: bool) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("BenchWork-updates")
        .redirect(reqwest::redirect::Policy::none())
        .tls_built_in_root_certs(false)
        .add_root_certificate(
            reqwest::Certificate::from_pem(CERTIFICATE.as_bytes())
                .map_err(|_| "Invalid update server certificate")?,
        )
        .no_proxy()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(if download { 900 } else { 30 }))
        .build()
        .map_err(|_| "Cannot initialise the update connection".into())
}
async fn latest(
    current: &str,
    android: bool,
    labels: bool,
) -> Result<Option<(Available, Asset)>, String> {
    let mut response = client(false)?
        .get(API)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|_| "Could not check for updates. Check your connection and try again.")?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("No update has been published on your server yet.".into());
    }
    if !response.status().is_success() {
        return Err("The release service is unavailable or rate limited. Try again later.".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "The update check was interrupted")?
    {
        if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
            return Err("Release details exceed the size limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let release =
        serde_json::from_slice(&bytes).map_err(|_| "Release details could not be read")?;
    select(release, current, android, labels)
}
pub async fn check(
    current: &str,
    android: bool,
    labels: bool,
) -> Result<Option<Available>, String> {
    Ok(latest(current, android, labels)
        .await?
        .map(|(info, _)| info))
}
impl Updates {
    pub async fn download(
        &self,
        root: PathBuf,
        current: String,
        android: bool,
        labels: bool,
        requested: String,
        window: tauri::WebviewWindow,
    ) -> Result<(), String> {
        let _guard = self
            .gate
            .try_lock()
            .map_err(|_| "An update is already downloading")?;
        let (info, asset) = latest(&current, android, labels)
            .await?
            .ok_or("This device is already up to date")?;
        if info.version != requested {
            return Err("The available release changed. Check for updates again.".into());
        }
        let hash = digest(&asset).ok_or("Missing update checksum")?;
        std::fs::create_dir_all(&root).map_err(|_| "Cannot create the update cache")?;
        let root = root
            .canonicalize()
            .map_err(|_| "Cannot find the update cache")?;
        let id = rand::random::<u64>();
        let path = root.join(format!(
            "BenchWork-update-{id}.{}",
            if android { "apk" } else { "exe" }
        ));
        let partial = root.join(format!("download-{id}.part"));
        *self.ready.lock().map_err(|_| "Update state unavailable")? = None;
        let result = async {
            let mut response = client(true)?
                .get(&asset.browser_download_url)
                .send()
                .await
                .map_err(|_| "The installer could not be downloaded")?;
            if !response.status().is_success()
                || response.content_length().is_some_and(|n| n > MAX_INSTALLER)
            {
                return Err("The installer download is unavailable or too large".into());
            }
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&partial)
                .map_err(|_| "Cannot save the installer. Check free disk space.")?;
            let mut hasher = Sha256::new();
            let mut downloaded = 0u64;
            let mut reported = 0u64;
            while let Some(chunk) = response
                .chunk()
                .await
                .map_err(|_| "The update download was interrupted. Try again.")?
            {
                downloaded += chunk.len() as u64;
                if downloaded > asset.size || downloaded > MAX_INSTALLER {
                    return Err("The installer is larger than its release record".into());
                }
                file.write_all(&chunk)
                    .map_err(|_| "Could not save the installer. Check free disk space.")?;
                hasher.update(&chunk);
                if downloaded - reported >= 512 * 1024 || downloaded == asset.size {
                    let _ = window.emit(
                        "update-download-progress",
                        serde_json::json!({"downloaded":downloaded,"total":asset.size}),
                    );
                    reported = downloaded;
                }
            }
            let actual = hasher
                .finalize()
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>();
            if downloaded != asset.size || actual != hash {
                return Err("The installer checksum did not match. It was not installed.".into());
            }
            file.sync_all()
                .map_err(|_| "Could not finish saving the installer")?;
            drop(file);
            std::fs::rename(&partial, &path).map_err(|_| "Cannot finish the verified installer")?;
            *self.ready.lock().map_err(|_| "Update state unavailable")? = Some(Ready {
                path: path.clone(),
                hash,
            });
            Ok(())
        }
        .await;
        let _ = std::fs::remove_file(partial);
        result
    }
    pub fn installer(&self) -> Result<Installer, String> {
        let ready = self.ready.lock().map_err(|_| "Update state unavailable")?;
        let ready = ready
            .as_ref()
            .ok_or("Download and verify an update first")?;
        if crate::file_info::sha256(&ready.path).map_err(|e| e.message)? != ready.hash {
            return Err("The downloaded installer changed. Download it again.".into());
        }
        Ok(Installer {
            path: crate::path_guard::display_path(&ready.path),
            hash: ready.hash.clone(),
        })
    }
    pub fn install(&self) -> Result<(), String> {
        let installer = self.installer()?;
        if !cfg!(windows) {
            return Err("Use the Android system installer on this device".into());
        }
        std::process::Command::new(Path::new(&installer.path))
            .spawn()
            .map_err(|_| "The installer could not start. Your work has been saved.")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn release(name: &str) -> Release {
        serde_json::from_value(serde_json::json!({"tag_name":"v0.20.0","body":"Changes","draft":false,"prerelease":false,
            "assets":[{"name":name,"size":123,"digest":format!("sha256:{}", "a".repeat(64)),"browser_download_url":"https://178.62.50.124/updates/installer.exe"}]})).unwrap()
    }
    #[test]
    fn compares_versions_numerically_and_selects_only_the_correct_verified_asset() {
        assert!(version("0.19.0") < version("0.20.0"));
        assert!(version("0.9.0") < version("0.18.0"));
        for invalid in ["0.20.0-beta", "0.20", "0.020.0", "../1.2.3"] {
            assert!(version(invalid).is_none());
        }
        assert!(select(
            release("BenchWork_0.20.0_x64-setup.exe"),
            "0.19.0",
            false,
            false
        )
        .unwrap()
        .is_some());
        assert!(select(
            release("BenchWork_0.20.0_x64-setup.exe"),
            "0.20.0",
            false,
            false
        )
        .unwrap()
        .is_none());
        assert!(select(
            release("BenchWork-Labels_0.20.0_x64-setup.exe"),
            "0.19.0",
            false,
            false
        )
        .is_err());
        assert!(
            select(release("BenchWork_0.20.0_arm64.apk"), "0.19.0", true, false)
                .unwrap()
                .is_some()
        );
        let mut bad = release("BenchWork_0.20.0_x64-setup.exe");
        bad.assets[0].digest = None;
        assert!(select(bad, "0.19.0", false, false).is_err());
        assert!(!asset_url(
            "https://github.com/Other/Repo/releases/download/v1/app.exe"
        ));
        assert!(!asset_url("http://178.62.50.124/updates/installer.exe"));
        assert!(!asset_url("https://evil.example/updates/installer.exe"));
    }
    #[test]
    fn refuses_installation_before_verification_or_after_tampering() {
        let updates = Updates::default();
        assert!(updates.installer().is_err());
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("update.exe");
        std::fs::write(&path, b"verified").unwrap();
        *updates.ready.lock().unwrap() = Some(Ready {
            path: path.clone(),
            hash: crate::native_sync::files::hash(b"verified"),
        });
        assert!(updates.installer().is_ok());
        std::fs::write(path, b"tampered").unwrap();
        assert!(updates.installer().is_err());
    }
    #[tokio::test]
    #[ignore = "Checks the deployed update feed after publishing installers"]
    async fn published_feed_selects_windows_and_android_over_pinned_https() {
        let windows = check("0.0.0", false, false).await.unwrap().unwrap();
        let android = check("0.0.0", true, false).await.unwrap().unwrap();
        assert_eq!(windows.version, android.version);
        assert!(windows.size > 0 && android.size > 0);
        assert!(check(&windows.version, false, false)
            .await
            .unwrap()
            .is_none());
    }
}
