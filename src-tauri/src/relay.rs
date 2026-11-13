//! Pinned HTTPS transport for the opaque cloud relay. No redirects or proxies.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Deserialize;
use std::{net::IpAddr, time::Duration};

#[derive(Deserialize)]
pub struct Request {
    endpoint: String,
    certificate: String,
    body: String,
}
pub async fn request(input: Request) -> Result<String, String> {
    let url = reqwest::Url::parse(&input.endpoint).map_err(|_| "Invalid relay address")?;
    let ip: IpAddr = url
        .host_str()
        .ok_or("Missing relay host")?
        .parse()
        .map_err(|_| "Use the relay's public IP address")?;
    let public = match ip {
        IpAddr::V4(ip) => {
            !ip.is_private()
                && !ip.is_loopback()
                && !ip.is_link_local()
                && !ip.is_unspecified()
                && !ip.is_multicast()
        }
        IpAddr::V6(_) => false,
    };
    if !public
        || url.scheme() != "https"
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
        || input.certificate.len() > 8192
        || input.body.len() > 1_600_000
    {
        return Err("Invalid relay connection or oversized request".into());
    }
    let cert = reqwest::Certificate::from_pem(input.certificate.as_bytes())
        .map_err(|_| "Invalid relay certificate")?;
    let client = reqwest::Client::builder()
        .tls_built_in_root_certs(false)
        .add_root_certificate(cert)
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .timeout(Duration::from_secs(35))
        .build()
        .map_err(|_| "Cannot initialise relay connection")?;
    let mut response = client
        .post(url.join("v1/relay").map_err(|_| "Invalid relay endpoint")?)
        .header("Content-Type", "application/json")
        .body(input.body)
        .send()
        .await
        .map_err(|error| format!("Relay unreachable or certificate changed. Your local work is kept; sync will retry. {error:?}"))?;
    let status = response.status();
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Relay transfer interrupted")?
    {
        if bytes.len() + chunk.len() > 4_000_000 {
            return Err("Relay response exceeds size limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let body = String::from_utf8(bytes).map_err(|_| "Invalid relay response")?;
    if !status.is_success() {
        let message = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v.get("error")?.as_str().map(str::to_owned))
            .unwrap_or_else(|| format!("Relay returned {}", status.as_u16()));
        return Err(message);
    }
    Ok(body)
}

/// Conditional projection, retaining the overwritten bytes before every change.
pub fn apply(
    root: &std::path::Path,
    path: &str,
    expected: Option<String>,
    encoded: Option<String>,
) -> Result<bool, String> {
    use crate::{native_sync::files, path_guard, vault_fs};
    if !allowed(path) {
        return Err("This file is excluded from cloud sync".into());
    }
    let target = path_guard::resolve(root, path).map_err(|e| e.message)?;
    let previous = match std::fs::read(&target) {
        Ok(bytes) => Some(bytes),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => None,
        Err(e) => return Err(e.to_string()),
    };
    if previous.as_deref().map(files::hash) != expected {
        return Ok(false);
    }
    let next = encoded
        .map(|s| {
            STANDARD
                .decode(s)
                .map_err(|_| "Invalid file bytes".to_string())
        })
        .transpose()?;
    if next.as_ref().is_some_and(|b| b.len() > files::MAX_FILE) {
        return Err("File exceeds sync size limit".into());
    }
    if let Some(old) = &previous {
        let id = format!("{}-{}", files::hash(path.as_bytes()), files::hash(old));
        files::save_json(
            root,
            &format!(".benchwork/relay/recovery/{id}.json"),
            &serde_json::json!({"path":path,"bytes":STANDARD.encode(old)}),
        )?;
    }
    std::fs::create_dir_all(target.parent().ok_or("Missing parent")?).map_err(|e| e.to_string())?;
    // This is optimistic coordination with external applications, not a cross-process transaction.
    let current = std::fs::read(&target).ok();
    if current.as_deref().map(files::hash) != expected {
        return Ok(false);
    }
    if let Some(bytes) = next {
        vault_fs::write_atomic(&target, &bytes).map_err(|e| e.message)?;
    } else if previous.is_some() {
        std::fs::remove_file(target).map_err(|e| e.to_string())?;
    }
    Ok(true)
}
pub fn allowed(path: &str) -> bool {
    crate::native_sync::files::allowed(path)
        || ((path.starts_with(".benchwork/modules/") || path == ".benchwork/file-tags.json")
            && crate::path_guard::normalise(path).is_ok_and(|p| p == path)
            && !path.split('/').skip(1).any(|p| p.starts_with('.')))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn confines_projection_and_keeps_recovery_before_changes() {
        for path in [
            "../outside",
            ".benchwork/config.json",
            ".benchwork/relay/checkpoint.json",
            ".git/config",
            "a/.hidden",
        ] {
            assert!(!allowed(path));
        }
        assert!(allowed("Lab/Notes.md"));
        assert!(allowed(".benchwork/modules/cloud/connections.json"));
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        assert!(apply(&root, "Note.md", None, Some(STANDARD.encode(b"old"))).unwrap());
        assert!(!apply(
            &root,
            "Note.md",
            Some("wrong".into()),
            Some(STANDARD.encode(b"bad"))
        )
        .unwrap());
        assert_eq!(std::fs::read(root.join("Note.md")).unwrap(), b"old");
        assert!(apply(
            &root,
            "Note.md",
            Some(crate::native_sync::files::hash(b"old")),
            Some(STANDARD.encode(b"new"))
        )
        .unwrap());
        let recovery = root.join(".benchwork/relay/recovery");
        let entry = std::fs::read_dir(recovery)
            .unwrap()
            .next()
            .unwrap()
            .unwrap();
        let saved: serde_json::Value =
            serde_json::from_slice(&std::fs::read(entry.path()).unwrap()).unwrap();
        assert_eq!(saved["path"], "Note.md");
        assert_eq!(saved["bytes"], STANDARD.encode(b"old"));
    }
    #[tokio::test]
    #[ignore = "Opt-in deployed relay certificate check; BENCHWORK_RELAY_SETUP required"]
    async fn deployed_tls_certificate_is_pinned() {
        let file = std::env::var("BENCHWORK_RELAY_SETUP").unwrap();
        let setup: serde_json::Value =
            serde_json::from_slice(&std::fs::read(file).unwrap()).unwrap();
        let input = Request {
            endpoint: setup["endpoint"].as_str().unwrap().into(),
            certificate: setup["certificate"].as_str().unwrap().into(),
            body: r#"{"action":"devices","vault":"nonexistent-test-vault","token":"none"}"#.into(),
        };
        assert_eq!(
            request(input).await.unwrap_err(),
            "Vault access unavailable"
        );
        let wrong = rcgen::generate_simple_self_signed(vec!["178.62.50.124".into()]).unwrap();
        let input = Request {
            endpoint: setup["endpoint"].as_str().unwrap().into(),
            certificate: wrong.cert.pem(),
            body: "{}".into(),
        };
        assert!(request(input)
            .await
            .unwrap_err()
            .contains("certificate changed"));
    }
}
