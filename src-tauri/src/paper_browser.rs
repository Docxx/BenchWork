//! A visible browser window where the person gets a paper's PDF themselves,
//! signed in as they would be in any browser, for publishers that refuse
//! downloads from apps. BenchWork keeps the first download that is a PDF,
//! then closes the window. The window shows the publisher's own page: it has
//! no access to BenchWork's commands, and BenchWork never clicks for the
//! person.

#[cfg_attr(mobile, allow(dead_code))]
const LIMIT: u64 = 64 * 1024 * 1024;
#[cfg_attr(mobile, allow(dead_code))]
const CLOSED: &str = "The window was closed before a PDF was downloaded.";

#[cfg_attr(mobile, allow(dead_code))]
fn is_pdf(bytes: &[u8]) -> bool {
    bytes[..bytes.len().min(1024)]
        .windows(5)
        .any(|s| s == b"%PDF-")
}

#[cfg_attr(mobile, allow(dead_code))]
/// What a finished download means: the PDF, a reason to stop, or nothing
/// (not a PDF, such as a supplement page; keep waiting for the PDF).
fn judge(bytes: std::io::Result<Vec<u8>>) -> Option<Result<Vec<u8>, String>> {
    match bytes {
        Ok(b) if b.len() as u64 > LIMIT => {
            Some(Err("The PDF exceeds the reader's 64 MB limit.".into()))
        }
        Ok(b) if is_pdf(&b) => Some(Ok(b)),
        _ => None,
    }
}

fn check(url: &str) -> Result<tauri::Url, String> {
    let address = tauri::Url::parse(url).map_err(|_| "Enter an HTTPS link to the paper.")?;
    if address.scheme() != "https" || !address.username().is_empty() || address.password().is_some()
    {
        return Err("Enter an HTTPS link to the paper.".into());
    }
    Ok(address)
}

#[cfg(desktop)]
mod window {
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::{Arc, Mutex};
    use tauri::webview::{DownloadEvent, NewWindowFeatures, NewWindowResponse};
    use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder, Wry};

    pub const LABEL: &str = "paper-browser";
    type Reply = tokio::sync::oneshot::Sender<Result<Vec<u8>, String>>;

    /// Shared by the window and any it opens: publishers often open the PDF
    /// in a new window (a link with target="_blank"), which the webview
    /// would otherwise block without a word.
    #[derive(Clone)]
    pub struct Catch {
        pub app: AppHandle,
        pub folder: PathBuf,
        pub reply: Arc<Mutex<Option<Reply>>>,
        pub count: Arc<AtomicU32>,
    }

    impl Catch {
        pub fn deliver(&self, result: Result<Vec<u8>, String>) {
            if let Some(tx) = self.reply.lock().ok().and_then(|mut r| r.take()) {
                let _ = tx.send(result);
            }
        }

        fn download(&self, event: DownloadEvent<'_>) -> bool {
            match event {
                DownloadEvent::Requested { destination, .. } => {
                    let n = self.count.fetch_add(1, Ordering::Relaxed);
                    *destination = self
                        .folder
                        .join(format!("{}-{n}.download", std::process::id()));
                }
                DownloadEvent::Finished {
                    path: Some(path),
                    success: true,
                    ..
                } => {
                    let bytes = std::fs::read(&path);
                    let _ = std::fs::remove_file(&path);
                    if let Some(result) = super::judge(bytes) {
                        self.deliver(result);
                    }
                }
                _ => {}
            }
            true
        }

        /// A window for the paper, or for a page the paper's site opens.
        pub fn builder(&self, label: String, url: Url) -> WebviewWindowBuilder<'_, Wry, AppHandle> {
            let on_download = self.clone();
            let on_new = self.clone();
            WebviewWindowBuilder::new(&self.app, label, WebviewUrl::External(url))
                .title("BenchWork: get the PDF")
                .on_download(move |_webview, event| on_download.download(event))
                .on_new_window(move |url, features| on_new.open(url, features))
        }

        fn open(&self, url: Url, features: NewWindowFeatures) -> NewWindowResponse<Wry> {
            let n = self.count.fetch_add(1, Ordering::Relaxed);
            match self
                .builder(format!("{LABEL}-{n}"), url)
                .inner_size(1000.0, 800.0)
                .window_features(features)
                .build()
            {
                Ok(window) => NewWindowResponse::Create { window },
                Err(_) => NewWindowResponse::Deny,
            }
        }

        /// Closes the paper's window and every window it opened.
        pub fn close_all(&self) {
            for (label, window) in self.app.webview_windows() {
                if label == LABEL || label.starts_with(&format!("{LABEL}-")) {
                    let _ = window.destroy();
                }
            }
        }
    }

    pub async fn browse(app: AppHandle, url: String) -> Result<Vec<u8>, String> {
        let address = super::check(&url)?;
        let folder = app
            .path()
            .app_cache_dir()
            .map_err(|e| e.to_string())?
            .join("paper-downloads");
        std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
        let (tx, rx) = tokio::sync::oneshot::channel();
        let catch = Catch {
            app,
            folder,
            reply: Arc::new(Mutex::new(Some(tx))),
            count: Arc::new(AtomicU32::new(0)),
        };
        catch.close_all();
        let window = catch
            .builder(LABEL.into(), address)
            .inner_size(1100.0, 850.0)
            .build()
            .map_err(|e| e.to_string())?;
        {
            // Closing the paper's own window cancels; closing one it opened does not.
            let catch = catch.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::Destroyed = event {
                    catch.deliver(Err(super::CLOSED.into()));
                }
            });
        }
        let result = rx.await.unwrap_or_else(|_| Err(super::CLOSED.into()));
        catch.close_all();
        result
    }
}

#[cfg(desktop)]
pub use window::browse;

#[cfg(mobile)]
pub async fn browse(_app: tauri::AppHandle, url: String) -> Result<Vec<u8>, String> {
    check(&url)?;
    Err("Getting a PDF in a browser window works on the computer for now.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_only_pdfs_within_the_limit() {
        assert_eq!(
            judge(Ok(b"%PDF-1.7 rest".to_vec())),
            Some(Ok(b"%PDF-1.7 rest".to_vec()))
        );
        assert_eq!(judge(Ok(b"<html>supplement</html>".to_vec())), None);
        assert_eq!(judge(Err(std::io::Error::other("gone"))), None);
        let big = vec![b'%'; (LIMIT + 1) as usize];
        assert!(matches!(judge(Ok(big)), Some(Err(_))));
    }

    #[test]
    fn opens_only_plain_https_links() {
        assert!(check("https://www.science.org/doi/10.1126/sciadv.x").is_ok());
        assert!(check("http://example.org/paper").is_err());
        assert!(check("https://user:pw@example.org/").is_err());
        assert!(check("not a link").is_err());
    }
}
