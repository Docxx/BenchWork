use super::files::{self, Action, Inventory, Result, MAX_FILE};
use crate::{microsoft, path_guard};
use axum::{
    extract::Request,
    middleware::{self, Next},
    response::{IntoResponse, Response},
};
use axum::{
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode},
    routing::post,
    Json, Router,
};
use axum_server::{tls_rustls::RustlsConfig, Handle};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    net::{Ipv4Addr, TcpListener, UdpSocket},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const PORT: u16 = 47831;
const MAX_BODY: usize = 48 * 1024 * 1024;
fn random() -> String {
    rand::random::<[u8; 32]>()
        .iter()
        .map(|n| format!("{n:02x}"))
        .collect()
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
pub fn local_ip() -> String {
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("192.0.2.1:80")?;
            s.local_addr()
        })
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".into())
}
fn private_ip(ip: Ipv4Addr) -> bool {
    let bytes = ip.octets();
    // Private overlays such as Tailscale use the shared 100.64.0.0/10 range.
    ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || (bytes[0] == 100 && (64..=127).contains(&bytes[1]))
}
#[derive(Clone, Serialize, Deserialize)]
struct Private {
    vault: String,
    ip: String,
    cert: String,
    key: String,
    devices: BTreeMap<String, String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Invitation {
    pub version: u32,
    pub endpoint: String,
    pub certificate: String,
    pub vault: String,
    pub secret: String,
    pub expires: u64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Connection {
    pub endpoint: String,
    pub certificate: String,
    pub vault: String,
    pub token: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostStatus {
    pub running: bool,
    pub endpoint: String,
    pub devices: Vec<String>,
}
#[derive(Serialize)]
pub struct Pairing {
    pub text: String,
    pub svg: String,
    pub expires: u64,
}
struct Host {
    root: PathBuf,
    config: PathBuf,
    storage_key: String,
    private: Mutex<Private>,
    invite: Mutex<Option<Invitation>>,
    gate: tokio::sync::Mutex<()>,
}
struct Running {
    host: Arc<Host>,
    handle: Handle<std::net::SocketAddr>,
}
#[derive(Default)]
pub struct NativeSync {
    running: Mutex<Option<Running>>,
    client_gate: tokio::sync::Mutex<()>,
}
impl Host {
    fn persist(&self, private: &Private) -> Result<()> {
        microsoft::write(
            &self.config,
            &self.storage_key,
            Some(serde_json::to_string(private).map_err(|e| e.to_string())?),
        )
        .map_err(|e| e.message)
    }
    fn status(&self) -> Result<HostStatus> {
        let p = self.private.lock().map_err(|_| "Sync state unavailable")?;
        Ok(HostStatus {
            running: true,
            endpoint: format!("https://{}:{PORT}", p.ip),
            devices: p.devices.values().cloned().collect(),
        })
    }
    fn authorised(&self, headers: &HeaderMap) -> bool {
        let Some(token) = headers
            .get("authorization")
            .and_then(|h| h.to_str().ok())
            .and_then(|s| s.strip_prefix("Bearer "))
        else {
            return false;
        };
        if token.len() != 64 {
            return false;
        }
        self.private
            .lock()
            .is_ok_and(|p| p.devices.contains_key(&files::hash(token.as_bytes())))
    }
}
impl NativeSync {
    pub fn status(&self) -> Result<HostStatus> {
        self.running
            .lock()
            .map_err(|_| "Sync state unavailable")?
            .as_ref()
            .map(|r| r.host.status())
            .unwrap_or_else(|| {
                Ok(HostStatus {
                    running: false,
                    endpoint: String::new(),
                    devices: vec![],
                })
            })
    }
    pub async fn start(
        &self,
        root: PathBuf,
        config: PathBuf,
        ip: String,
        other_sync_stopped: bool,
    ) -> Result<HostStatus> {
        if cfg!(target_os = "android") {
            return Err("Host the server on your Windows desktop".into());
        }
        check_engine(&root, other_sync_stopped)?;
        let address: Ipv4Addr = ip
            .parse()
            .map_err(|_| "Enter the desktop's local IPv4 address")?;
        if !private_ip(address) {
            return Err("Choose a private local-network address".into());
        }
        let already_running = self
            .running
            .lock()
            .map_err(|_| "Sync state unavailable")?
            .is_some();
        if already_running {
            return self.status();
        }
        let _ = rustls::crypto::ring::default_provider().install_default();
        let storage_key = format!(
            "native-sync-host-{}",
            &files::hash(root.to_string_lossy().as_bytes())[..32]
        );
        let saved = microsoft::read(&config, &storage_key).map_err(|e| e.message)?;
        let mut private: Private = match saved { Some(text) => serde_json::from_str(&text).map_err(|_| "Host identity could not be read; restore its device settings before restarting sync")?, None => Private { vault:random(),ip:ip.clone(),cert:String::new(),key:String::new(),devices:BTreeMap::new() } };
        if private.cert.is_empty() || private.ip != ip {
            let key = rcgen::generate_simple_self_signed(vec![
                ip.clone(),
                "localhost".into(),
                "127.0.0.1".into(),
            ])
            .map_err(|_| "Cannot create desktop certificate")?;
            private.cert = key.cert.pem();
            private.key = key.signing_key.serialize_pem();
            private.ip = ip;
            // Changing network identity needs fresh authenticated pairing.
            private.devices.clear();
        }
        let tls = RustlsConfig::from_pem(
            private.cert.as_bytes().to_vec(),
            private.key.as_bytes().to_vec(),
        )
        .await
        .map_err(|_| "Cannot initialise encrypted server")?;
        let listener = TcpListener::bind((address, PORT))
            .map_err(|e| format!("Cannot listen on {address}:{PORT}: {e}"))?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let host = Arc::new(Host {
            root,
            config,
            storage_key,
            private: Mutex::new(private.clone()),
            invite: Mutex::new(None),
            gate: tokio::sync::Mutex::new(()),
        });
        host.persist(&private)?;
        let protected = Router::new()
            .route("/v1/manifest", post(manifest))
            .route("/v1/file", post(get_file))
            .route("/v1/put", post(put_file))
            .route_layer(middleware::from_fn_with_state(host.clone(), require_auth));
        let app = Router::new()
            .route("/v1/pair", post(pair).layer(DefaultBodyLimit::max(4096)))
            .merge(protected)
            .layer(DefaultBodyLimit::max(MAX_BODY))
            .with_state(host.clone());
        let handle = Handle::new();
        let server = axum_server::from_tcp_rustls(listener, tls)
            .map_err(|e| e.to_string())?
            .handle(handle.clone());
        let run_host = host.clone();
        tokio::spawn(async move {
            let _ = server.serve(app.into_make_service()).await;
            run_host.invite.lock().ok().map(|mut i| {
                *i = None;
            });
        });
        let status = host.status()?;
        *self.running.lock().map_err(|_| "Sync state unavailable")? =
            Some(Running { host, handle });
        Ok(status)
    }
    pub async fn stop(&self) -> Result<()> {
        let running = self
            .running
            .lock()
            .map_err(|_| "Sync state unavailable")?
            .take();
        if let Some(run) = running {
            run.handle.shutdown();
            let _guard = run.host.gate.lock().await;
        }
        let _client = self.client_gate.lock().await;
        Ok(())
    }
    pub fn invitation(&self) -> Result<Pairing> {
        let run = self.running.lock().map_err(|_| "Sync state unavailable")?;
        let host = &run.as_ref().ok_or("Start the desktop server first")?.host;
        let p = host
            .private
            .lock()
            .map_err(|_| "Sync state unavailable")?
            .clone();
        let invitation = Invitation {
            version: 1,
            endpoint: format!("https://{}:{PORT}", p.ip),
            certificate: p.cert.clone(),
            vault: p.vault.clone(),
            secret: random(),
            expires: now() + 600,
        };
        let text = serde_json::to_string(&invitation).map_err(|e| e.to_string())?;
        let code =
            qrcode::QrCode::new(text.as_bytes()).map_err(|_| "Cannot create pairing code")?;
        let svg = code
            .render::<qrcode::render::svg::Color>()
            .min_dimensions(400, 400)
            .build();
        *host
            .invite
            .lock()
            .map_err(|_| "Pairing state unavailable")? = Some(invitation.clone());
        Ok(Pairing {
            text,
            svg,
            expires: invitation.expires,
        })
    }
    pub fn revoke_all(&self) -> Result<()> {
        let running = self.running.lock().map_err(|_| "Sync state unavailable")?;
        let host = &running.as_ref().ok_or("Start the server first")?.host;
        let mut private = host.private.lock().map_err(|_| "Sync state unavailable")?;
        let mut next = private.clone();
        next.devices.clear();
        host.persist(&next)?;
        *private = next;
        drop(private);
        *host
            .invite
            .lock()
            .map_err(|_| "Pairing state unavailable")? = None;
        Ok(())
    }
}
#[cfg(all(test, windows))]
mod tests {
    use super::*;
    #[tokio::test]
    async fn encrypted_two_device_sync_preserves_offline_edits_deletes_and_rejects_revoked_devices()
    {
        let host_temp = tempfile::tempdir().unwrap();
        let peer_temp = tempfile::tempdir().unwrap();
        let config = tempfile::tempdir().unwrap();
        let root = path_guard::canonical_root(host_temp.path()).unwrap();
        let peer = path_guard::canonical_root(peer_temp.path()).unwrap();
        files::apply(&root, "note.md", None, Some(b"desktop")).unwrap();
        let host = NativeSync::default();
        host.start(
            root.clone(),
            config.path().into(),
            "127.0.0.1".into(),
            false,
        )
        .await
        .unwrap();
        let invitation: Invitation =
            serde_json::from_str(&host.invitation().unwrap().text).unwrap();
        let connection = join(invitation.clone(), "Test tablet".into())
            .await
            .unwrap();
        assert!(join(invitation, "Another device".into()).await.is_err());
        let client = NativeSync::default();
        client
            .sync(peer.clone(), connection.clone(), false)
            .await
            .unwrap();
        assert_eq!(files::read(&peer, "note.md").unwrap().unwrap(), b"desktop");
        files::apply(
            &root,
            "note.md",
            Some(&files::hash(b"desktop")),
            Some(b"desktop changed"),
        )
        .unwrap();
        files::apply(
            &peer,
            "note.md",
            Some(&files::hash(b"desktop")),
            Some(b"offline tablet"),
        )
        .unwrap();
        let report = client
            .sync(peer.clone(), connection.clone(), false)
            .await
            .unwrap();
        assert_eq!(report.conflicts.len(), 1);
        assert_eq!(
            files::read(&peer, "note.md").unwrap().unwrap(),
            b"desktop changed"
        );
        assert_eq!(
            files::read(&peer, &report.conflicts[0]).unwrap().unwrap(),
            b"offline tablet"
        );
        client
            .sync(peer.clone(), connection.clone(), false)
            .await
            .unwrap();
        assert_eq!(
            files::read(&root, &report.conflicts[0]).unwrap().unwrap(),
            b"offline tablet"
        );
        files::apply(
            &peer,
            "note.md",
            Some(&files::hash(b"desktop changed")),
            None,
        )
        .unwrap();
        client
            .sync(peer.clone(), connection.clone(), false)
            .await
            .unwrap();
        assert!(files::read(&root, "note.md").unwrap().is_none());
        let work_temp = tempfile::tempdir().unwrap();
        let work_root = path_guard::canonical_root(work_temp.path()).unwrap();
        let work_invitation = serde_json::from_str(&host.invitation().unwrap().text).unwrap();
        let work_connection = join(work_invitation, "Work computer".into()).await.unwrap();
        let work = NativeSync::default();
        work.sync(work_root.clone(), work_connection.clone(), false)
            .await
            .unwrap();
        files::apply(
            &work_root,
            "Work findings.md",
            None,
            Some(b"Written at work"),
        )
        .unwrap();
        work.sync(work_root.clone(), work_connection.clone(), false)
            .await
            .unwrap();
        client
            .sync(peer.clone(), connection.clone(), false)
            .await
            .unwrap();
        assert_eq!(
            files::read(&peer, "Work findings.md").unwrap().unwrap(),
            b"Written at work"
        );
        files::apply(&root, "Home findings.md", None, Some(b"Written at home")).unwrap();
        work.sync(work_root.clone(), work_connection.clone(), false)
            .await
            .unwrap();
        client
            .sync(peer.clone(), connection.clone(), false)
            .await
            .unwrap();
        assert_eq!(
            files::read(&work_root, "Home findings.md")
                .unwrap()
                .unwrap(),
            b"Written at home"
        );
        assert_eq!(
            files::read(&peer, "Home findings.md").unwrap().unwrap(),
            b"Written at home"
        );
        let mut wrong = connection.clone();
        wrong.certificate = rcgen::generate_simple_self_signed(vec!["127.0.0.1".into()])
            .unwrap()
            .cert
            .pem();
        assert!(client.sync(peer.clone(), wrong, false).await.is_err());
        host.revoke_all().unwrap();
        assert!(client.sync(peer.clone(), connection, false).await.is_err());
        assert!(work.sync(work_root, work_connection, false).await.is_err());
        host.stop().await.unwrap();
        client.stop().await.unwrap();
        work.stop().await.unwrap();
    }
    #[test]
    fn accepts_private_vpn_addresses_but_not_public_servers() {
        assert!(private_ip("100.64.0.1".parse().unwrap()));
        assert!(private_ip("100.127.255.254".parse().unwrap()));
        assert!(!private_ip("100.63.255.255".parse().unwrap()));
        assert!(!private_ip("100.128.0.1".parse().unwrap()));
        assert!(!private_ip("8.8.8.8".parse().unwrap()));
    }
}
pub fn check_engine(root: &Path, stopped: bool) -> Result<()> {
    if root.join(".stfolder").exists() && !stopped {
        return Err(
            "Pause Syncthing for this vault, then confirm it is stopped before using Desktop Sync"
                .into(),
        );
    }
    Ok(())
}
type ApiResult = std::result::Result<Json<serde_json::Value>, (StatusCode, String)>;
async fn require_auth(State(host): State<Arc<Host>>, request: Request, next: Next) -> Response {
    if !host.authorised(request.headers()) {
        return (StatusCode::UNAUTHORIZED, "Pair this device again").into_response();
    }
    next.run(request).await
}
fn bad(message: impl Into<String>) -> (StatusCode, String) {
    (StatusCode::BAD_REQUEST, message.into())
}
fn auth(host: &Host, headers: &HeaderMap) -> std::result::Result<(), (StatusCode, String)> {
    if host.authorised(headers) {
        Ok(())
    } else {
        Err((StatusCode::UNAUTHORIZED, "Pair this device again".into()))
    }
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct PairRequest {
    secret: String,
    name: String,
}
async fn pair(State(host): State<Arc<Host>>, Json(input): Json<PairRequest>) -> ApiResult {
    if input.name.trim().is_empty() || input.name.len() > 80 || input.secret.len() != 64 {
        return Err(bad("Invalid pairing request"));
    }
    let mut slot = host.invite.lock().map_err(|_| bad("Pairing unavailable"))?;
    let invitation = slot
        .as_ref()
        .ok_or_else(|| bad("Generate a new pairing code"))?;
    if invitation.expires < now()
        || files::hash(input.secret.as_bytes()) != files::hash(invitation.secret.as_bytes())
    {
        return Err((
            StatusCode::UNAUTHORIZED,
            "Pairing code is invalid or expired".into(),
        ));
    }
    let token = random();
    let mut p = host.private.lock().map_err(|_| bad("Sync unavailable"))?;
    if p.devices.len() >= 16 {
        return Err(bad("Remove paired devices before adding another"));
    }
    let mut next = p.clone();
    next.devices
        .insert(files::hash(token.as_bytes()), input.name);
    host.persist(&next).map_err(bad)?;
    *p = next;
    *slot = None;
    Ok(Json(serde_json::json!({"token":token,"vault":p.vault})))
}
async fn manifest(State(host): State<Arc<Host>>, headers: HeaderMap) -> ApiResult {
    auth(&host, &headers)?;
    let _gate = host.gate.lock().await;
    auth(&host, &headers)?;
    let root = host.root.clone();
    let inventory = tokio::task::spawn_blocking(move || files::scan(&root))
        .await
        .map_err(|_| bad("Cannot scan the vault"))?
        .map_err(bad)?;
    let vault = host
        .private
        .lock()
        .map_err(|_| bad("Sync unavailable"))?
        .vault
        .clone();
    Ok(Json(
        serde_json::json!({"vault":vault,"files":inventory.files,"skipped":inventory.skipped}),
    ))
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct FileRequest {
    path: String,
    expected: Option<String>,
    content: Option<String>,
}
async fn get_file(
    State(host): State<Arc<Host>>,
    headers: HeaderMap,
    Json(input): Json<FileRequest>,
) -> ApiResult {
    auth(&host, &headers)?;
    let _gate = host.gate.lock().await;
    auth(&host, &headers)?;
    let bytes = files::read(&host.root, &input.path).map_err(bad)?;
    if bytes.as_deref().map(files::hash) != input.expected {
        return Err((StatusCode::CONFLICT, "File changed; retry sync".into()));
    }
    Ok(Json(
        serde_json::json!({"content":bytes.map(|b| STANDARD.encode(b))}),
    ))
}
async fn put_file(
    State(host): State<Arc<Host>>,
    headers: HeaderMap,
    Json(input): Json<FileRequest>,
) -> ApiResult {
    auth(&host, &headers)?;
    let _gate = host.gate.lock().await;
    auth(&host, &headers)?;
    let bytes = input
        .content
        .map(|s| STANDARD.decode(s).map_err(|_| bad("Invalid file data")))
        .transpose()?;
    if bytes.as_ref().is_some_and(|b| b.len() > MAX_FILE) {
        return Err(bad("File exceeds sync size limit"));
    }
    if files::current(&host.root, &input.path).map_err(bad)? != bytes.as_deref().map(files::hash)
        && !files::apply(
            &host.root,
            &input.path,
            input.expected.as_deref(),
            bytes.as_deref(),
        )
        .map_err(bad)?
    {
        return Err((StatusCode::CONFLICT, "File changed; retry sync".into()));
    }
    Ok(Json(serde_json::json!({"ok":true})))
}
fn client(endpoint: &str, certificate: &str) -> Result<reqwest::Client> {
    let url = reqwest::Url::parse(endpoint).map_err(|_| "Invalid server address")?;
    let ip = url
        .host_str()
        .and_then(|s| s.parse::<Ipv4Addr>().ok())
        .ok_or("Use a local IPv4 server address")?;
    if url.scheme() != "https"
        || !private_ip(ip)
        || url.port() != Some(PORT)
        || url.path() != "/"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || certificate.len() > 10000
    {
        return Err("Only an encrypted local BenchWork server is supported".into());
    }
    let _ = rustls::crypto::ring::default_provider().install_default();
    let certificate = reqwest::Certificate::from_pem(certificate.as_bytes())
        .map_err(|_| "Invalid desktop certificate")?;
    reqwest::Client::builder()
        .tls_built_in_root_certs(false)
        .add_root_certificate(certificate)
        .https_only(true)
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(90))
        .build()
        .map_err(|_| "Cannot initialise the encrypted connection".into())
}
async fn request(
    client: &reqwest::Client,
    connection: &Connection,
    route: &str,
    body: &impl Serialize,
) -> Result<serde_json::Value> {
    let mut response = client
        .post(format!("{}{route}", connection.endpoint))
        .bearer_auth(&connection.token)
        .json(body)
        .send()
        .await
        .map_err(|error| {
            let mut cause: &dyn std::error::Error = &error;
            while let Some(next) = cause.source() {
                cause = next;
            }
            format!(
                "Desktop connection failed: {}. Check the server, local network or private VPN.",
                cause
            )
        })?;
    if !response.status().is_success() {
        return Err(match response.status().as_u16() {
            401 => "Pairing was revoked or expired. Pair this device again.",
            409 => "A file changed during sync. Your edits are kept; retry sync.",
            _ => "The desktop could not complete this sync request.",
        }
        .into());
    }
    if response
        .content_length()
        .is_some_and(|n| n > MAX_BODY as u64)
    {
        return Err("Sync response exceeds its size limit".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Connection interrupted; retry sync")?
    {
        if bytes.len() + chunk.len() > MAX_BODY {
            return Err("Sync response is too large".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "Invalid sync response".into())
}
pub async fn join(invitation: Invitation, name: String) -> Result<Connection> {
    if invitation.version != 1
        || invitation.expires < now()
        || invitation.secret.len() != 64
        || invitation.vault.len() != 64
    {
        return Err(
            "This pairing code is expired or unsupported. Generate a new one on the desktop."
                .into(),
        );
    }
    let client = client(&invitation.endpoint, &invitation.certificate)?;
    let mut connection = Connection {
        endpoint: invitation.endpoint,
        certificate: invitation.certificate,
        vault: invitation.vault,
        token: String::new(),
    };
    let result = request(
        &client,
        &connection,
        "/v1/pair",
        &PairRequest {
            secret: invitation.secret,
            name,
        },
    )
    .await?;
    if result["vault"].as_str() != Some(&connection.vault) {
        return Err("The server vault does not match this invitation".into());
    }
    connection.token = result["token"]
        .as_str()
        .filter(|t| t.len() == 64)
        .ok_or("Invalid pairing response")?
        .into();
    Ok(connection)
}
#[derive(Default, Serialize)]
pub struct Report {
    pub uploaded: u32,
    pub downloaded: u32,
    pub conflicts: Vec<String>,
    pub skipped: Vec<String>,
}
impl NativeSync {
    pub async fn sync(
        &self,
        root: PathBuf,
        connection: Connection,
        other_sync_stopped: bool,
    ) -> Result<Report> {
        let _gate = self.client_gate.lock().await;
        check_engine(&root, other_sync_stopped)?;
        if connection.vault.len() != 64
            || !connection.vault.bytes().all(|b| b.is_ascii_hexdigit())
            || connection.token.len() != 64
        {
            return Err("Invalid device pairing".into());
        }
        let client = client(&connection.endpoint, &connection.certificate)?;
        let raw = request(&client, &connection, "/v1/manifest", &serde_json::json!({})).await?;
        if raw["vault"].as_str() != Some(&connection.vault) {
            return Err("This is a different desktop vault. Pair again.".into());
        }
        let remote: Inventory =
            serde_json::from_value(raw).map_err(|_| "Invalid remote file list")?;
        if remote.files.len() > 20000
            || remote.skipped.len() > 20000
            || remote.files.iter().any(|(p, e)| {
                !files::allowed(p)
                    || e.hash.len() != 64
                    || !e.hash.bytes().all(|b| b.is_ascii_hexdigit())
                    || e.size > MAX_FILE as u64
            })
        {
            return Err("Invalid remote inventory".into());
        }
        let local = files::scan(&root)?;
        let baseline_path = format!(".benchwork/native-sync/peers/{}.json", connection.vault);
        let baseline_file = path_guard::resolve(&root, &baseline_path).map_err(|e| e.message)?;
        let mut base: BTreeMap<String, String> = if baseline_file.exists() {
            serde_json::from_slice(&std::fs::read(baseline_file).map_err(|e| e.to_string())?)
                .map_err(|_| "Sync history could not be read; restore it before syncing")?
        } else {
            BTreeMap::new()
        };
        let mut report = Report::default();
        report.skipped = local
            .skipped
            .iter()
            .chain(&remote.skipped)
            .cloned()
            .collect();
        let paths: BTreeSet<String> = local
            .files
            .keys()
            .chain(remote.files.keys())
            .chain(base.keys())
            .cloned()
            .collect();
        for path in paths {
            if report.skipped.contains(&path) {
                continue;
            }
            if !files::allowed(&path) {
                return Err("Invalid path in sync history".into());
            }
            let l = local.files.get(&path).map(|e| e.hash.as_str());
            let r = remote.files.get(&path).map(|e| e.hash.as_str());
            let b = base.get(&path).map(|s| s.as_str());
            match files::action(b, l, r) {
                Action::Same => {}
                Action::Push => {
                    let bytes = files::read(&root, &path)?;
                    if bytes.as_deref().map(files::hash).as_deref() != l {
                        return Err("A local file changed. Retry sync.".into());
                    }
                    request(
                        &client,
                        &connection,
                        "/v1/put",
                        &FileRequest {
                            path: path.clone(),
                            expected: r.map(String::from),
                            content: bytes.map(|b| STANDARD.encode(b)),
                        },
                    )
                    .await?;
                    if let Some(h) = l {
                        base.insert(path.clone(), h.into());
                    } else {
                        base.remove(&path);
                    }
                    report.uploaded += 1;
                    files::save_json(&root, &baseline_path, &base)?;
                    continue;
                }
                Action::Pull | Action::Conflict => {
                    let data = request(
                        &client,
                        &connection,
                        "/v1/file",
                        &FileRequest {
                            path: path.clone(),
                            expected: r.map(String::from),
                            content: None,
                        },
                    )
                    .await?;
                    let bytes = data["content"]
                        .as_str()
                        .map(|s| STANDARD.decode(s).map_err(|_| "Invalid downloaded file"))
                        .transpose()?;
                    if bytes.as_deref().map(files::hash).as_deref() != r {
                        return Err("Downloaded file verification failed".into());
                    }
                    if files::current(&root, &path)?.as_deref() != l {
                        return Err("A local file changed. Retry sync.".into());
                    }
                    if files::action(b, l, r) == Action::Conflict {
                        if let Some(old) = files::read(&root, &path)? {
                            report.conflicts.push(files::keep_copy(&root, &path, &old)?);
                        } else {
                            report
                                .conflicts
                                .push(format!("{path}: remote edit retained after local deletion"));
                        }
                    }
                    if !files::apply(&root, &path, l, bytes.as_deref())? {
                        return Err("A local file changed. Retry sync.".into());
                    }
                    report.downloaded += 1;
                }
            }
            if let Some(h) = r {
                base.insert(path.clone(), h.into());
            } else {
                base.remove(&path);
            }
            files::save_json(&root, &baseline_path, &base)?;
        }
        Ok(report)
    }
}
