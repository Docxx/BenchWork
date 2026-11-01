# Desktop Sync

Desktop Sync connects the installed Windows app and Android app directly over a
local network. No cloud account or university Microsoft registration is needed.
The desktop must be awake with BenchWork running. The Android app checks every
15 seconds while running; it reconnects when the desktop becomes reachable.
Android may suspend it when backgrounded, so this is not an always-on background
service. Use Sync now after returning to the app.

## Set up

1. Use a vault outside OneDrive, Dropbox, Google Drive or another synchronised
   folder. Pause Syncthing for the vault. Prefer separate local copies of an
   existing cloud/Syncthing vault, keeping the originals as backups.
2. On Windows, open Settings > Sync. Check the suggested local IPv4 address and
   start the desktop server. It listens on HTTPS port 47831 on that address only.
   Windows Firewall may require permission for the trusted local connection.
   Do not open a router port or expose the server to the internet.
3. Choose Pair another device. Its invitation is single-use and expires after
   ten minutes. Save the pairing file to Downloads and transfer it privately to
   the tablet, or copy the pairing details. The QR encodes the same details for
   a compatible scanner; BenchWork does not request camera access.
4. On Android, open a local vault and Settings > Sync. Enter a device name and
   import the pairing file, or paste the details. The first sync begins after
   successful pairing. Existing divergent files are preserved separately.

The host and client roles resume when their vaults reopen. A vault marked for
Syncthing requires fresh confirmation on each launch before reconnecting.
Disable Desktop Sync removes this device's connection settings, keeping files.
Remove paired devices on the host revokes every device and pending invitation.
An IP address change requires starting with the new address and pairing again.

For local scripted setup on Windows, launch `benchwork.exe --host-sync-vault`
with an existing local vault folder as its next argument. This explicitly starts
hosting, remembers the selected vault and writes a ten-minute pairing file to
Downloads. It refuses a vault still marked for Syncthing. The GUI opens normally;
subsequent launches resume the saved host role without this argument.

## Home desktop, work computer and tablet

Use the home desktop as the single host. Install the Windows build on the work
computer, open a separate local vault there, and pair it as a client, like the
tablet. Generate a fresh single-use invitation for each device. Saved changes
travel from either client to the host, then to the other client on its next sync.
The host must be awake and reachable; the clients need not be online together.

For different networks, connect all three devices through an authorised private
VPN first. BenchWork accepts private IPv4 and shared-overlay addresses in
`100.64.0.0/10`, including Tailscale addresses. Use the host's reachable VPN
address when starting the server, allow only the client VPN addresses through
the host firewall, then pair both clients using invitations for that endpoint.
Changing from a LAN address to a VPN address requires fresh pairing. A general
internet-exit VPN alone does not necessarily connect your devices to each other.
VPN installation, work-device policy and remote connectivity need separate setup;
this does not require a BenchWork cloud storage service.

## What synchronises

Saved ordinary vault files, including Markdown, YAML records, ink, PDF marks,
attachments and teaching material, up to **32 MB per file**. Larger files are
listed as skipped. External dataset links synchronise as records; the external
datasets stay in their original storage. Empty folders arrive with their first
file. Vaults are limited to 20,000 visible files/folders in this first version.

Hidden folders, `.benchwork`, temporary files, account credentials, local settings
and search indexes are excluded. Enable the same modules on each device through
Settings > Modules. Theme packs can be shared as ordinary vault files; each
device keeps its applied appearance. Sync errors remain visible and retrying is
safe after an interrupted transfer.

## Conflicts and recovery

This first desktop-hosted transport synchronises saved files. It does not merge
live editor state or offer collaborative editing. When only one device changed
a file, that version transfers. If both changed it, the tablet/client keeps its
own version under a `sync copy` filename and receives the desktop's version.
The saved copy transfers to the desktop on the next successful sync. Ink and
structured records follow the same preserve-both rule, including erasures.

A deletion propagates only when the receiving file still matches the last
synchronised version. A competing edit is preserved separately. A remote
overwrite or deletion keeps a local snapshot under
`.benchwork/native-sync/recovery`, with a JSON file recording its original path.
These recovery copies currently have no automatic expiry. Sync is not a backup;
keep independent vault backups.

Per-file comparison baselines live in `.benchwork/native-sync/peers`. Do not
remove them during normal use. A restored old backup or a rebuilt connection
can produce extra preserved copies; review restored content separately before
pairing it to a live vault. File comparisons are optimistic: avoid editing a
file in external programs during a transfer. Live document history and stronger
cross-process write coordination remain future work.

## Security

The desktop generates a self-signed TLS certificate. An invitation transfers its
public certificate, vault identity, local endpoint and short-lived pairing secret.
The client trusts only that supplied certificate, checks its address and refuses
redirects, proxies and public server addresses. Pairing creates a random device
token. The host stores token hashes and its private key in Windows DPAPI storage;
the Android client stores its connection in Android Keystore-backed storage.
These are outside the vault. File requests require authentication before their
bodies are parsed. Paths, payloads, file hashes and transfer sizes are checked.

This encrypts the connection between the user's own devices. Local vault files
remain ordinary readable files. A future cloud relay will need a separate
end-to-end encrypted envelope protocol; this server should not be deployed as
that relay.

## Development checks

Native integration tests start a real encrypted loopback server with two vaults,
pair a client, transfer files, preserve conflicting offline changes, propagate a
deletion and reject an untrusted certificate and revoked device. State tests
cover pairing storage, Syncthing confirmation and waiting for transfers before a
vault switch. Browser tests exercise the setup and pairing screens.
