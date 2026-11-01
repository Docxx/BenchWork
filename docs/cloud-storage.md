# Cloud storage

Enable **Cloud storage** in Settings > Modules, under Data and storage.

On a Windows computer, choose OneDrive, Dropbox, Google Drive or Other synced
folder, then select a folder managed by that provider's desktop sync app. You
can connect several providers and accounts. Connections are saved privately on
this device, outside the vault. Disconnecting leaves all files in place.

Choose a data file and optionally a dataset record, then select **Copy and
verify**. BenchWork copies the file in chunks, using a unique destination folder
and keeping the source. Large files do not pass through JavaScript memory.
A SHA-256 check verifies the written copy and checks that the source did not
change during copying. Transfers can be cancelled; changing vaults waits for
the active operation to finish safely.

Each operation creates a small `.cloud.yaml` record in `Research/Cloud` with
the provider, account label, relative storage path, source, size, checksum,
dataset link and verification status. Failed and cancelled operations leave a
record too. The provider's desktop app handles uploading. **Verified** means a
local byte-for-byte copy, not a confirmed remote upload. BenchWork does not
request cloud account passwords, use cloud APIs or verify remaining quota.

After verification, **Manage local space** offers two separate actions:

- Open the provider folder and use its Free up space or Online-only command
  after the provider confirms upload completion.
- Explicitly confirm that upload finished, then move the separate original
  source to the Recycle Bin. BenchWork checks both files again first and keeps
  the source if either changed. Sources inside a connected cloud folder are
  excluded from this action. Existing links and scripts may need a new path;
  emptying the Recycle Bin is separate and is never automatic.

The tablet can review vault-synced storage records. Transfer and location
controls are available on the computer that created a copy. Storage records do
not grant cloud access or download large files automatically. To use the same
provider on another device, configure that provider's own app there.
