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

**Latest installer** in the preview footer, and **Get latest installer** in
Settings > General, open
[BenchWork Releases](https://github.com/Docxx/BenchWork/releases). This is a
manual download link, not an automatic update check or installer. BenchWork
does not claim a newer version exists or contact a release service at launch.

The maintainer must publish each installer as a GitHub release asset before it
is available on that page. There were no published releases when this feature
was added. Publishing a release is a separate action from building or sharing
an installer file.

To update, save work, close BenchWork and run the newer installer over the
existing installation. Keep the same app identifier so device preferences and
pairing credentials remain in their existing location. The vault is separate
from the executable and is not replaced by the installer. Keep a backup while
testing development builds. Android testers install a newer APK with the same
package identity and signing key.

Automatic updates can be added later using Tauri's signed updater artifacts and
a published update feed. Updater signatures and Windows code-signing certificates
serve different purposes. This preview adds neither an updater service nor a
new signing key. See [Tauri's updater documentation](https://v2.tauri.app/plugin/updater/).

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
