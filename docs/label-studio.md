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

Drag elements to move them and drag the selected blue corner to resize them.
Text size scales with the corner handle. Arrow keys move a focused element;
arrow keys on its resize handle resize it. Hold Shift for larger steps.
Width and height are directly editable; position and rotation are in a disclosure.
QR codes, Code 128 barcodes, boxes and lines are under **More elements**. The
properties panel controls dimensions, position, rotation, text size, font family,
alignment and bold text. Images are embedded PNG, JPEG or WebP data; no remote
images or executable SVG content is accepted. Print preview shows calibrated
monochrome output separately from editing guides.

Use the **Batch data** tab for CSV, Excel and BenchWork records.
Use `{today}` for the current local date, `{name}`, `{id}`, `{date}` or any spreadsheet column heading in braces.
`{n}` inserts the sequence number. CSV strings retain leading zeroes and dates;
Excel uses displayed cell values. The first worksheet is used. Jobs are limited
to 500 labels, and spreadsheet imports to 10 MB. Template imports are limited to
5 MB, with at most 100 elements.

Load BenchWork records to fill one label or use the loaded set as a batch.
Supported record kinds include samples, reagents, antibodies, stocks, datasets
and experiments. Scalar properties become available as fields. Notes, raw data
and linked files are not uploaded to any label service.

## Templates and the companion

The **Library** tab shows searchable previews of templates and recent prints.
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
or All files access. Export and import `.label.json` files to transfer templates
between BenchWork and the companion. Android export opens the system share
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

Printing always requires **Review labels** followed by **Print now**. All pages
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
