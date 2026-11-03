//! Microsoft transport and device-local Windows-protected storage.
use crate::error::{ErrorKind, VaultError, VaultResult};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::Path, time::Duration};

#[derive(Deserialize)]
pub struct Request {
    url: String,
    method: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    body: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    status: u16,
    body: String,
    retry_after: Option<String>,
}
fn fail(message: &str) -> VaultError {
    VaultError::new(ErrorKind::Io, message)
}

fn allowed(url: &reqwest::Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url.fragment().is_none()
        && matches!(
            url.host_str(),
            Some("graph.microsoft.com" | "login.microsoftonline.com")
        )
}
pub async fn request(input: Request) -> VaultResult<Response> {
    let url = reqwest::Url::parse(&input.url).map_err(|_| fail("Invalid Microsoft address"))?;
    if !allowed(&url) {
        return Err(fail(
            "Only Microsoft sign-in and Graph addresses are allowed",
        ));
    }
    if !matches!(input.method.as_str(), "GET" | "POST" | "PATCH" | "DELETE") {
        return Err(fail("Unsupported Microsoft request"));
    }
    if input
        .body
        .as_ref()
        .is_some_and(|b| b.len() > 8 * 1024 * 1024)
    {
        return Err(fail("This request is too large"));
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(40))
        .build()
        .map_err(|_| fail("Cannot initialise Microsoft connection"))?;
    let method = reqwest::Method::from_bytes(input.method.as_bytes())
        .map_err(|_| fail("Invalid request method"))?;
    let mut builder = client.request(method, url);
    for (key, value) in input.headers {
        if !matches!(
            key.to_ascii_lowercase().as_str(),
            "authorization" | "content-type" | "accept" | "prefer" | "if-match"
        ) {
            return Err(fail("Unsupported Microsoft header"));
        }
        builder = builder.header(key, value);
    }
    if let Some(body) = input.body {
        builder = builder.body(body);
    }
    let mut response = builder
        .send()
        .await
        .map_err(|_| fail("Microsoft could not be reached. Check the connection and try again."))?;
    let status = response.status().as_u16();
    let retry_after = response
        .headers()
        .get("retry-after")
        .and_then(|h| h.to_str().ok())
        .map(String::from);
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| fail("Microsoft response was interrupted"))?
    {
        if bytes.len() + chunk.len() > 12 * 1024 * 1024 {
            return Err(fail("Microsoft response is too large"));
        }
        bytes.extend_from_slice(&chunk);
    }
    let body =
        String::from_utf8(bytes).map_err(|_| fail("Microsoft returned an unsupported response"))?;
    Ok(Response {
        status,
        body,
        retry_after,
    })
}

fn file(root: &Path, key: &str) -> VaultResult<std::path::PathBuf> {
    if key.is_empty()
        || key.len() > 128
        || !key
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
    {
        return Err(fail("Invalid private storage key"));
    }
    Ok(root.join("private").join(format!("{key}.bin")))
}
pub fn read(root: &Path, key: &str) -> VaultResult<Option<String>> {
    let path = file(root, key)?;
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(path).map_err(|_| fail("Cannot read device-local data"))?;
    let plain = crypt(&bytes, false)?;
    String::from_utf8(plain)
        .map(Some)
        .map_err(|_| fail("Private data could not be decoded. Reconnect the account."))
}
pub fn write(root: &Path, key: &str, value: Option<String>) -> VaultResult<()> {
    let path = file(root, key)?;
    match value {
        None => {
            if path.exists() {
                std::fs::remove_file(path).map_err(|_| fail("Cannot remove device-local data"))?;
            }
            Ok(())
        }
        Some(value) => {
            if value.len() > 8 * 1024 * 1024 {
                return Err(fail("Private cache is too large"));
            }
            let encrypted = crypt(value.as_bytes(), true)?;
            std::fs::create_dir_all(path.parent().unwrap())
                .map_err(|_| fail("Cannot create private storage"))?;
            crate::vault_fs::write_atomic(&path, &encrypted)
        }
    }
}

#[cfg(target_os = "windows")]
fn crypt(bytes: &[u8], encrypt: bool) -> VaultResult<Vec<u8>> {
    use std::ffi::c_void;
    #[repr(C)]
    struct Blob {
        len: u32,
        data: *mut u8,
    }
    #[link(name = "crypt32")]
    extern "system" {
        fn CryptProtectData(
            input: *const Blob,
            description: *const u16,
            entropy: *const Blob,
            reserved: *mut c_void,
            prompt: *mut c_void,
            flags: u32,
            output: *mut Blob,
        ) -> i32;
        fn CryptUnprotectData(
            input: *const Blob,
            description: *mut *mut u16,
            entropy: *const Blob,
            reserved: *mut c_void,
            prompt: *mut c_void,
            flags: u32,
            output: *mut Blob,
        ) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn LocalFree(memory: *mut c_void) -> *mut c_void;
    }
    let input = Blob {
        len: bytes.len() as u32,
        data: bytes.as_ptr() as *mut u8,
    };
    let mut output = Blob {
        len: 0,
        data: std::ptr::null_mut(),
    };
    // DPAPI binds encryption to this Windows user; the data never enters the vault.
    unsafe {
        let result = if encrypt {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                1,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                1,
                &mut output,
            )
        };
        if result == 0 {
            return Err(fail(
                "Windows could not protect or unlock this account's local data",
            ));
        }
        let result = std::slice::from_raw_parts(output.data, output.len as usize).to_vec();
        LocalFree(output.data.cast());
        Ok(result)
    }
}
#[cfg(not(target_os = "windows"))]
fn crypt(_: &[u8], _: bool) -> VaultResult<Vec<u8>> {
    Err(fail("Encrypted storage is provided by the Android bridge on tablets. This desktop platform is not supported yet."))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn confines_network_and_storage() {
        for value in [
            "http://graph.microsoft.com/v1.0/me",
            "https://graph.microsoft.com.evil.test",
            "https://user@graph.microsoft.com",
            "https://graph.microsoft.com:444/me",
            "https://127.0.0.1",
        ] {
            assert!(!allowed(&reqwest::Url::parse(value).unwrap()));
        }
        assert!(allowed(
            &reqwest::Url::parse("https://graph.microsoft.com/v1.0/me").unwrap()
        ));
        assert!(file(Path::new("root"), "../secret").is_err());
    }
    #[cfg(target_os = "windows")]
    #[test]
    fn encrypts_and_removes_private_data() {
        let root = tempfile::tempdir().unwrap();
        write(root.path(), "outlook.test", Some("private token".into())).unwrap();
        assert_ne!(
            std::fs::read(file(root.path(), "outlook.test").unwrap()).unwrap(),
            b"private token"
        );
        assert_eq!(
            read(root.path(), "outlook.test").unwrap(),
            Some("private token".into())
        );
        write(root.path(), "outlook.test", None).unwrap();
        assert_eq!(read(root.path(), "outlook.test").unwrap(), None);
    }
}
