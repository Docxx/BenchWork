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
pub async fn browse(app: tauri::AppHandle, url: String) -> Result<Vec<u8>, String> {
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::{Arc, Mutex};
    use tauri::webview::DownloadEvent;
    use tauri::Manager;

    const LABEL: &str = "paper-browser";
    type Reply = tokio::sync::oneshot::Sender<Result<Vec<u8>, String>>;
    fn deliver(reply: &Mutex<Option<Reply>>, result: Result<Vec<u8>, String>) {
        if let Some(tx) = reply.lock().ok().and_then(|mut r| r.take()) {
            let _ = tx.send(result);
        }
    }

    let address = check(&url)?;
    if let Some(old) = app.get_webview_window(LABEL) {
        let _ = old.destroy();
    }
    let folder = app
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?
        .join("paper-downloads");
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;

    let (tx, rx) = tokio::sync::oneshot::channel();
    let reply = Arc::new(Mutex::new(Some(tx)));
    let count = Arc::new(AtomicU32::new(0));
    let on_download = {
        let reply = reply.clone();
        let folder = folder.clone();
        move |_webview, event: DownloadEvent<'_>| {
            match event {
                DownloadEvent::Requested { destination, .. } => {
                    let n = count.fetch_add(1, Ordering::Relaxed);
                    *destination = folder.join(format!("{}-{n}.download", std::process::id()));
                }
                DownloadEvent::Finished {
                    path: Some(path),
                    success: true,
                    ..
                } => {
                    let bytes = std::fs::read(&path);
                    let _ = std::fs::remove_file(&path);
                    if let Some(result) = judge(bytes) {
                        deliver(&reply, result);
                    }
                }
                _ => {}
            }
            true
        }
    };
    let window =
        tauri::WebviewWindowBuilder::new(&app, LABEL, tauri::WebviewUrl::External(address))
            .title("BenchWork: get the PDF")
            .inner_size(1100.0, 850.0)
            .on_download(on_download)
            .build()
            .map_err(|e| e.to_string())?;
    {
        let reply = reply.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::Destroyed = event {
                deliver(&reply, Err(CLOSED.into()));
            }
        });
    }
    let result = rx.await.unwrap_or_else(|_| Err(CLOSED.into()));
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.destroy();
    }
    result
}

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
