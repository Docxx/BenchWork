# Label Studio

Label Studio is an optional BenchWork module and a separate Android companion.
It designs labels offline without a subscription or a NIIMBOT account. Enable
**Label Studio** in Settings > Modules > Lab and experiments.

## Tested printer and paper

Windows Bluetooth discovery, identification and printing were tested against a
NIIMBOT B3S, model ID 262, firmware 37.07. The B1 print task is used. The user
confirmed the corrected A2/B2 calibration pair aligned on the real labels:

- Each label is 50 mm across the roll and 15 mm along the feed.
- Two labels are stacked along the feed in one 50 × 30 mm page.
- There is no internal gap. The printer handles the external paper gap.
- Artwork offset is 0 mm horizontally and −0.75 mm vertically.
- Resolution is 203 dpi, with print density 2 as the starting value.

The first test used an incorrect 2 mm internal gap. It was corrected after a
photo showed feed-direction drift. Paper layout, internal gap, offsets, density
and monochrome threshold remain adjustable and are saved in each template.

Only B3S model ID 262 is enabled for printing in this first version. The installed
Samsung S26 companion was also tested over paired Bluetooth classic: the printer
acknowledged the PHONE TEST jobs and the user confirmed the corrected A2/B2 pair.
The phone template uses vertical offset **+1.25 mm**, after a requested 2 mm
downward adjustment from the starting profile. It is saved in the phone's
library. New designs keep the chosen paper settings, and the companion reopens
the last saved template. A physical tablet acceptance check is still pending.

## Design and data

The **Design** tab focuses on **Text**, **Date** and **Image**. New designs start
with plain editable text. Choose **Date** to add a date, then
use **Always use today's date** to keep it current at print time, or untick it
to enter a fixed date. Existing templates remain compatible.

Tap an existing element on the label to reveal **Edit text**, **Copy**, **Delete**
and **Style and size** immediately beneath the canvas. Copy makes an independent
editable element. **Undo delete** restores the last removed element without
replacing later edits. Delete/Backspace removes a focused canvas element;
Ctrl+D duplicates it. These shortcuts do not intercept typing in text fields.
The phone has a compact editor with a fixed Save/Review bar. BenchWork exposes
the broader folder and export controls alongside the canvas.

Drag elements to move them and drag the selected blue corner to resize them.
Text size scales with the corner handle. Arrow keys move a focused element;
arrow keys on its resize handle resize it. Hold Shift for larger steps.
Width and height are directly editable; position and rotation are in a disclosure.
QR codes, Code 128 barcodes, boxes and lines are under **More elements**. The
properties panel controls dimensions, position, rotation, text size, font family,
alignment, bold, italic, underline and line spacing. Centre horizontally or
vertically to position an element, and use the layer controls for overlaps. Images are embedded PNG, JPEG or WebP data; no remote
images or executable SVG content is accepted. Print preview shows calibrated
monochrome output separately from editing guides.

Use the **Batch data** tab for CSV, Excel and BenchWork records.
Use `{today}` for the current local date, `{name}`, `{id}`, `{date}` or any spreadsheet column heading in braces.
`{n}` inserts the sequence number. CSV strings retain leading zeroes and dates;
Excel uses displayed cell values. The first worksheet is used. Jobs are limited
to 500 labels, and spreadsheet imports to 10 MB. Each design supports at most
100 elements. Portable packs contain 1 to 100 designs and are limited to 25 MB.

Load BenchWork records to fill one label or use the loaded set as a batch.
Supported record kinds include samples, reagents, antibodies, stocks, datasets
and experiments. Scalar properties become available as fields. Notes, raw data
and linked files are not uploaded to any label service.

## Templates and the companion

The **Library** tab shows searchable pair previews of templates and recent prints.
Phone cards use the full available width for readable label previews. The companion
has a blue-and-teal header and larger tool buttons; printable artwork stays white
and monochrome. BenchWork previews use the current workspace theme.
Create folders, assign a label from the BenchWork editor, or select several saved
labels and move them together. Folders are portable library metadata inside each
label JSON, rather than operating-system paths. Empty folders are recorded in
`Labels/folders.json` in a vault, or local storage in the companion. All underlying
label files retain their stable IDs when organised into folders.
After acknowledged printing, the first label in each job is saved as a separate
recent-print record with resolved text, so it can be reopened without its original
spreadsheet. This does not store a full batch history. A library-save failure
after printing reports that the labels have already printed.
Save templates explicitly before leaving the editor. BenchWork stores them as
ordinary `Labels/<id>.label.json` files; replacing a template keeps a recovery
snapshot. Disabling the module leaves those files in place. Vault sync can carry
them between BenchWork installations.

The standalone companion has its own local template library and its own Android
application ID, `app.benchwork.labels`. It does not require opening a full vault
or All files access. Both apps accept individual `.label.json` files and
`.labelpack.json` packs. A pack carries folder names, editable elements, embedded
images, styles and saved text-field values. No spreadsheet needs to accompany it.
A live `{today}` element updates on the printing device.

### Desktop to phone

1. Create and save labels in BenchWork, and assign them to a folder if useful.
2. Choose **Export for phone** for the open label, or select labels in the Library
   and choose **Export selected**. Open a folder and choose **Export folder** to
   take its visible labels together. Search and template/recent-print filters apply.
3. Windows saves a uniquely named pack in Downloads and displays its path.
   Android opens its system share chooser. Transfer the pack using Quick Share,
   USB or a cloud folder.
4. On the phone, open **Library > Import labels** and choose the pack. Imported
   copies are saved locally with new IDs, preserving existing labels. Images and
   saved field values remain available offline.
5. Open a label, review the print count and print with the paired B3S.

**Use this device's print alignment when importing matching paper** is on by
default under **Taking labels to the lab**. Matching means the same label width,
height, arrangement, labels per feed and internal gap. The phone's offsets and
density are kept for matching designs, so desktop exports do not overwrite the
verified +1.25 mm phone offset. Different paper keeps its imported settings and
needs a matching calibration check. Untick the option to retain imported offsets.
The phone imports a whole pack with one local-storage write; a storage-full error
leaves its existing library intact. Vault imports report how many labels were
saved if a write fails partway through.

Android export opens the system share
chooser with a temporary read-only file. This is manual library exchange;
automatic companion-to-desktop synchronisation is not included yet.

## Printing

Paper size, calibration, density and Bluetooth controls live in **Printer settings**.
Turn the B3S on and close other apps connected to it. Choose **Search printers**.
A single result connects automatically; if there are several, select one and
choose **Connect**. Installed apps remember the last successful printer and retry
its connection every 15 seconds while Label Studio is open. Background retries
do not block editing and are paused during print jobs. **Disconnect** turns off
automatic reconnection; re-enable it using **Auto-connect to last printer**.
Browser Bluetooth still requires a user click to connect. Android asks for Nearby devices permission
(Location on Android 11 and earlier). If permission was just requested, allow it
and tap Search printers again. Bluetooth LE does not require manual OS pairing;
the classic transport uses an already-paired device.

Printing always requires **Review labels** followed by **Print now**. Set the
number of labels in the review dialog when printing without a spreadsheet batch. All pages
are rendered and validated before the first print command. Each feed contains up
to two labels; an unused label on the last feed stays blank. Progress distinguishes
sent pages from acknowledged completion. Stop requests finish the current feed.
Failures and uncertain completion never cause automatic retries. Check the paper
before restarting an interrupted job.

Scan a sample QR code or barcode with the intended reader before a large batch.
The preview does not prove that a physical code is readable on a chosen roll.

## Maintainer builds

Approved dependencies are NiimBlueLib, bwip-js and the Windows Bluetooth bindings.
Third-party licences ship in `public/label-studio-licenses.txt`. The Windows
transport uses WinRT GATT or paired RFCOMM. Android uses its native Bluetooth APIs.
The shared protocol client sends print commands; no firmware controls are exposed.

Normal BenchWork builds use `pnpm tauri build --bundles nsis` and the existing
Android command. For the standalone companion set `BENCHWORK_LABEL_STUDIO=1`
before building, then run:

```powershell
pnpm tauri android build --config src-tauri/tauri.labels.android.conf.json --debug --target aarch64 --apk --ci
```

This keeps the existing `app.benchwork` JNI namespace while Gradle gives the
companion a separate application ID and visible name. The label-only frontend
is built into `dist-labels`. Copy the resulting APK to a versioned distribution
filename before another Android build reuses the output path. Debug APKs are
for local testing. A distributable Android release needs a stable signing key.

The manual diagnostic is `cargo run --manifest-path src-tauri/Cargo.toml --bin
label_probe` for discovery. `node scripts/label-probe.mjs <discovered-id>` reads
identity only. The explicit `--test-print` option sends one calibration page
from `test-results/label-calibration/calibration.bmp`; generate it with
`scripts/make-label-calibration.ps1`. Never schedule this diagnostic or retry a
print automatically.
