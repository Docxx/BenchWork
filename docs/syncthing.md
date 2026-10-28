# Syncing a vault between your computer and tablet

BenchWork keeps your notebooks as ordinary files in a vault folder.
[Syncthing](https://syncthing.net) copies that folder between your devices
directly, over your own network, with no account or cloud service. Each
device keeps a full copy, so you can work offline on either.

## What you need

- **On Windows:** Syncthing. The easiest install is
  [Syncthing Windows Setup](https://github.com/Bill-Stewart/SyncthingWindowsSetup),
  which starts Syncthing with Windows.
- **On the Android tablet:** the **Syncthing-Fork** app, from Google Play
  or F-Droid.

Both devices need to be on the same network the first time they connect.

## 1. Share the vault from your computer

1. Open Syncthing on the computer. It opens in your web browser, at
   <http://127.0.0.1:8384>.
2. Click **Add Folder**.
3. Give it a name, such as `Lab vault`. For **Folder Path**, choose your
   BenchWork vault folder: the one that holds the `.benchwork` folder.
4. Click **Save**.

## 2. Connect the tablet

1. Open Syncthing-Fork on the tablet. Allow it to manage all files when
   it asks.
2. On the computer, click **Actions > Show ID**. On the tablet, tap the
   plus button on the **Devices** tab and scan the QR code.
3. On the computer, accept the tablet when Syncthing asks.
4. On the computer, open the vault folder's **Edit** settings, then the
   **Sharing** tab. Tick the tablet, and click **Save**.

## 3. Accept the vault on the tablet

1. The tablet asks whether to add the shared folder. Accept it.
2. Set the folder's path to somewhere easy to find, such as
   `/storage/emulated/0/Documents/Lab vault`.
3. Leave **Folder Type** as **Send & Receive**, so changes go both ways.
4. Wait for the first sync to finish.

## 4. Open it in BenchWork on the tablet

1. Open BenchWork and tap **Open vault**.
2. Allow access to manage all files, if asked.
3. Go to `Documents`, then `Lab vault`, and tap **Open this folder**.

## What BenchWork does for you

- **Keeps each device's own files out of syncing.** In a folder Syncthing
  syncs, BenchWork adds lines to its `.stignore` file, so the search index,
  recovery copies and the tablet's trash stay on each device. Each device
  builds its own search index from the pages.
- **Merges drawings by itself.** If a drawing changes on both devices
  before they sync, BenchWork keeps every stroke from both.
- **Shows pages that changed on both devices.** Syncthing keeps both
  versions. BenchWork hides the extra copy from search and the sidebar,
  and a **Differences** item appears in the sidebar. There you see both
  versions side by side, with the lines that differ marked, and choose:
  - **Keep this page**: the other copy goes to the Recycle Bin.
  - **Use the other copy**: the page becomes the other version.
  - **Keep both**: the other copy becomes a page of its own, called
    "(other copy)".
  - **Open this page to merge by hand**: copy what you need across, then
    come back and choose **Keep this page**.

## Tips

- Let a sync finish before editing the same page on the other device.
  Differences only happen when the same page changes on both devices
  before they catch up.
- Deleted pages go to the computer's Recycle Bin. On the tablet, they go
  to the vault's `.benchwork/trash` folder, which is not synced.
- Large data files that are linked rather than copied into the vault stay
  where they are, and are not synced.
