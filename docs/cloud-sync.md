# Cloud sync

Cloud sync connects Windows and Android directly to your private, always-on relay.
Your PC does not need to stay awake. It is separate from Desktop Sync, which uses
your PC as the local-network host. Use one sync engine for a vault at a time.

## First device

1. Keep an independent vault backup. Stop Syncthing and other folder sync for this
   vault, and disable Desktop Sync. Use an ordinary local folder on each device.
2. Open Settings > Sync > Cloud sync and confirm that other folder sync is stopped.
3. Import or paste the private server setup JSON, choose a device name, and choose
   **Set up this vault** under **First device or recovery**. A server setup code is
   single-use. It creates one vault, not a public registration endpoint.
4. Save the **recovery details** privately outside the vault. They contain the
   content encryption key and owner credential. The server cannot recover them.
5. Choose **Pair another device**. Transfer its details privately to the tablet.
   An invitation is single-use and expires after ten minutes.

On another device, open a separate local vault, confirm other sync is stopped,
paste the pairing details, name the device and choose **Connect this device**.
The device downloads the existing history before importing local files. Identical
files adopt that history. Existing divergent files are kept separately.

Sync runs automatically while BenchWork is open: shortly after saved file changes,
otherwise every three seconds, with retries backing off to one minute. Returning
to the app or regaining connectivity triggers a retry. Android can suspend the app
in the background; this is not an Android background service. Sync now is also
available. Changes must be saved locally before they are uploaded.

## Files, merging and recovery

- Markdown bodies merge using persistent Yjs character history. Frontmatter keys
  merge separately; concurrent changes to the same key have a deterministic
  winner. The editor imports received changes without rebuilding the active
  editor, mapping its selection through the change.
  Overlapping edits to the same word can interleave and require review; exact
  previous file versions remain in local recovery.
- Images, PDFs, ink, whiteboards, YAML and other structured files use versioned
  binary content. Competing revisions are kept under `sync copy` names; ink
  erasures are not undone by unioning stroke lists. There is no semantic whiteboard
  or ink merge in this version.
- A delete concurrent with an edit retains the edited content. Matching moves
  preserve the file's object ID and history. Divergent path collisions retain
  separate copies; file-versus-folder collisions stop projection visibly.
- Files up to 32 MB transfer in verified, encrypted 512 KB chunks. Larger files
  are listed as skipped and must use linked datasets or Cloud storage. Markdown
  CRDT merging is limited to 4 MB per note.
- Ordinary vault files, `.benchwork/modules/` shared module data and
  `.benchwork/file-tags.json` sync. Device settings, account credentials, indexes,
  local recovery data, hidden folders and temporary files do not.
- Atomic checkpoints under `.benchwork/relay/` retain the Yjs state, encrypted
  outbox, received fragments, cursor, import baselines and pending projections.
  Uploads are retried with the same identities. Acknowledgements mean durable
  receipt by the relay, not that another device has downloaded the change.
- Before replacing or deleting a file, native projection saves its old bytes and
  original path under `.benchwork/relay/recovery/`. Conditional writes detect
  changed files. A crash during projection resumes the planned export; later
  local edits merge from the saved pre-receive history. External applications are
  coordinated optimistically; a cross-process edit in the final write window is
  outside that guarantee. Keep independent backups.

Do not remove `.benchwork/relay/`. Missing or damaged history stops automatic
reconnect rather than generating unrelated history. Vault backups include this
history; secrets remain in Windows DPAPI or Android Keystore storage outside the
vault. A restored backup at a different path cannot silently reconnect. Explicit
recovery details are required to re-enrol a restored or replacement device.

**Disconnect this device** retains files and local history. It does not revoke
the device's old credential. To remove lost-device access, use the original device
to **Close sharing group**. This closes all device credentials and invitations.
Generate a new server setup code through SSH, establish a fresh sharing group with
a new content key, then pair the trusted devices again. This deliberately rotates
both the group identity and encryption key; old devices cannot read future epochs.
Previously downloaded content cannot be erased remotely.

## Security and relay operations

The relay uses TLS with a certificate provisioned through the administrator's SSH
connection. Native clients trust only the supplied certificate for that public
IPv4 address, disable proxies and redirects, and keep normal hostname checking.
A certificate change fails closed and requires new connection details.

Web Crypto AES-256-GCM encrypts every envelope with a fresh random 96-bit nonce.
Associated data binds protocol version, vault identity, object identity and
message kind. The exact encrypted outbox is persisted before upload, so retries
do not reuse a nonce for different content. Opaque random blob IDs do not reveal
plaintext content hashes. Authenticated content is validated before projection.

The relay learns device names, vault routing IDs, IP addresses, timing, ciphertext
sizes and encrypted update counts. It does not receive note text, file paths,
plaintext content hashes, content keys or recovery keys. Availability and complete
delivery still depend on the relay; encryption cannot prevent it withholding data.

`relay/server.py` uses Python 3.12+, TLS and SQLite WAL with full synchronous
transactions. Limits include 16 concurrent request workers, 30-second connection
timeouts, bounded requests/responses, a 10 GB ciphertext quota per vault and no
request-body logging. The systemd service runs as `benchwork-relay`, can write
only its data directory and receives only permission to bind its HTTPS port.

Provision on a fresh Ubuntu server after reviewing the source:

```sh
sudo bash relay/install.sh PUBLIC_IPV4
```

Retrieve `/root/benchwork-relay-setup.json` privately over SSH. Do not commit or
publish it. To issue another single-use setup code while retaining existing vaults:

```sh
sudo python3 /opt/benchwork-relay/admin.py PUBLIC_IPV4
sudo systemctl restart benchwork-relay
```

Back up `/var/lib/benchwork-relay/relay.sqlite` with SQLite's backup API, together
with `/etc/benchwork-relay/` protected as secrets. File-level copying of a running
SQLite database without its WAL is not a safe backup. Encrypted event history and
unused blobs currently have no automatic expiry or compaction; monitor disk use.
The pinned certificate expires after 825 days; replace it and re-enrol devices
before that date. No domain name or public certificate authority is required.

Tests cover offline concurrent edits and restart, identical-file enrolment,
binary conflicts, rename and delete/edit races, shared module data exclusions,
checkpoint failure, interrupted projection, late external edits, wrong keys and
envelope binding. Relay tests cover single-use setup and invitations, expiry,
revocation, durable idempotency, immutable upload identities and malformed input.
Real PC/tablet acceptance remains a separate gate. Account-based live co-editing
and native Android background sync are not implemented by this transport.

### Native smoke check, 13 November 2026

The built Windows app and Galaxy Tab S10 Ultra (SM-X920) paired through the live
relay using separate test vaults. A PC note arrived on the tablet; a paragraph
typed in the tablet editor arrived on the PC. With tablet Wi-Fi disabled, a new
tablet paragraph was saved, the app was force-stopped and reopened offline, and
a separate PC paragraph was saved. After restoring Wi-Fi, both devices contained
both paragraphs and their saved note hashes matched. A 1.1 MB attachment crossed
the encrypted chunk transport with matching SHA-256 on both devices. The existing
research vaults were not enrolled as part of this smoke check. The full ink,
rename/delete and restored-backup acceptance checklist remains outstanding.

References: [Yjs updates](https://docs.yjs.dev/api/document-updates),
[Web Crypto AES-GCM](https://www.w3.org/TR/WebCryptoAPI/#aes-gcm),
[SQLite atomic commit](https://sqlite.org/atomiccommit.html).
