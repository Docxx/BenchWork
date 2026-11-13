# Sharing BenchWork previews

Share the Windows `BenchWork_0.15.0_x64-setup.exe` installer with testers. They do
not need the source repository, Node, Rust or a development server. This build
targets Windows x64 and uses WebView2. The installer can install the runtime if
it is missing, which needs an internet connection. The installer is currently
unsigned, so Windows or workplace policy may flag it.

Describe it as a development preview and use a copied test vault. Vault data and
account credentials are not packaged into the installer. The test recipient
chooses their own local vault. Desktop Sync pairing, including any VPN access,
is separate from installing BenchWork; sharing the installer grants no access
to Ray's vault or sync server.

## Feedback

A temporary footer is visible throughout the app, including before a vault is
opened. **Feedback & bugs** supports bug reports, suggestions and general
feedback. The tester fills in a title and description, then reviews the exact
report. Steps and expected behaviour are optional for bugs. App version, build
identifier and device type can be omitted using the checkbox.

**Open email draft** opens the tester's default email app, addressed to
`raywprice@gmail.com`. The tester must review and send it there. BenchWork does
not send email or require an account. **Copy report** supports webmail and
devices without a configured mail app. Very long reports use a short draft
placeholder; copy the full report into that draft before sending.

Notes, account details, vault paths, logs and screenshots are not added by the
app. Testers should review what they type and any screenshot they attach in
their email app. Closing the dialog retains its draft in memory until BenchWork
closes; report text is not written into the vault or uploaded in the background.
The feedback inbox address is intentionally included in the distributed app.

## Updates

In **Settings > General > About and updates**, choose **Check for updates**.
When a newer version is available, choose **Download update**, then **Install
update**. Downloads show progress and are checked against their published SHA-256
and size. BenchWork saves and closes the vault before opening the system installer;
save failures keep your work open and prevent installation.

**Check for updates when BenchWork starts** is an optional per-device preference,
off by default. It checks once at startup without blocking the local workspace.
An available update appears in a small notification that can be dismissed until
the next check. Download and installation always need an explicit action.

Updates are hosted on Ray's server at `178.62.50.124`, separately from encrypted
vault data. Native clients pin the public certificate in `src-tauri/update-server.pem`,
refuse redirects, bound download sizes and recheck the installer before launch.
The catalogue and checksums are authenticated by that pinned TLS connection; this
is not Tauri's separately signed updater-artifact protocol. Protect the server and
its TLS key as the source of trusted installers. Renewing the pinned certificate
requires distributing a build that trusts the replacement before switching it.

Windows opens the NSIS installer and exits after saving. Android opens its system
installer; it may first ask you to allow updates from BenchWork. APK package name,
newer version and signing key must match the installed app. Android's installer
still asks before replacing the app. Cancelling leaves the saved workspace usable.

**Latest installer** in the preview footer and **Get latest installer** in Settings
remain manual links to [BenchWork Releases](https://github.com/Docxx/BenchWork/releases).
The GitHub API is not used by the in-app updater because the release feed is not
publicly accessible to unauthenticated devices.

The first public preview is [0.15.0](https://github.com/Docxx/BenchWork/releases/tag/v0.15.0),
with the Windows x64 installer and SHA-256 checksums. The maintainer must publish
each newer installer as a GitHub release asset before it is available on that
page. Publishing a release is a separate action from building or sharing an
installer file.

To update, save work, close BenchWork and run the newer installer over the
existing installation. Keep the same app identifier so device preferences and
pairing credentials remain in their existing location. The vault is separate
from the executable and is not replaced by the installer. Keep a backup while
testing development builds. Android testers install a newer APK with the same
package identity and signing key.

To publish a verified build to the private server's update service:

```powershell
./scripts/publish-update.ps1 -Version 0.19.0 `
  -WindowsInstaller ./src-tauri/target/debug/bundle/nsis/BenchWork_0.19.0_x64-setup.exe `
  -AndroidApk ./src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk `
  -SshKey C:/Users/Ray/.ssh/benchwork_relay `
  -Notes 'In-app update checks and installation'
```

The script uploads both installers to `/var/lib/benchwork-relay/updates`, checks
their hashes remotely and replaces `latest.json` only after both are ready. Assets
are named `BenchWork_<version>_x64-setup.exe` and `BenchWork_<version>_arm64.apk`.
Never replace an existing version with different bytes; increment the version.
Use the same Android signing key across releases. The update routes serve only
the catalogue and versioned installers, excluding partial uploads and other files.
They do not require sync credentials or expose vault content. Published installer
downloads are accessible to anyone who knows the URL and trusts the certificate.

## Removing the temporary controls

Settings > General > Preview testing can hide or restore the toolbar on one
device. Feedback remains reachable from that settings section during testing.
The toolbar's X button hides it without deleting any data.

For finished builds set `VITE_PREVIEW_TOOLS=false` before building. This removes
the toolbar, feedback dialog and Preview testing settings even when a device
previously had the toolbar enabled. The version and manual download link remain
under About and updates.

## Building the preview

Keep `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` versions
in step. The UI reads the package version; Vite records the short commit hash,
with `-modified` if source changes were present when the build began. Source
archives without Git use `development` as their build identifier.

Run `pnpm test`, `pnpm lint` and the browser checks, then
`pnpm tauri build --bundles nsis`. The generated installer is under
`src-tauri/target/release/bundle/nsis`. Only publish verified artifacts; private
sync invitations and local vault files never belong in release assets.
