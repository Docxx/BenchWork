# Ink spike: method and results

Phase 1 spike. Question: is pen writing in a web view good enough on the
Galaxy Tab S10, or does ink need a native view? The answer decides how
Phase 4 builds ink. This page is a test bench, not app code; nothing here
ships.

**Status:** waiting for tablet measurements.

## What the page does

- Records pen strokes as `{x, y, pressure, t}` points, the shape SPEC.md
  gives for `.ink.json`.
- Reads every pen sample the browser has, not only one per frame
  (coalesced points).
- Draws finished strokes once into an off-screen cache, so writing costs
  the same on an empty page and on a full one.
- Shows timings live, and exports them as JSON with **Export results**.

Controls:

| Control                    | What it changes                                                                  |
| -------------------------- | -------------------------------------------------------------------------------- |
| Line                       | perfect-freehand outline, or simple segments whose width follows pressure        |
| Predicted points           | Draws the browser's guess of where the pen is going, to hide latency             |
| Low-latency canvas         | Asks for a desynchronized canvas, which can skip a step in drawing to the screen |
| Raw pointer updates        | Uses `pointerrawupdate`, which fires as input arrives instead of once per frame  |
| Fingers scroll, never draw | One finger scrolls the page; only the pen and mouse draw                         |
| Ignore touch near the pen  | Touches within 500 ms of the pen being seen (hovering or writing) are ignored    |
| Ignore large touches       | Touches wider than 40 px, usually a palm, are ignored                            |
| Add 2,000 strokes          | Fills the page with handwriting-like strokes to test redraw cost and file size   |

The panel also says whether each browser feature is available. Some only
work on secure pages (HTTPS or localhost), so check **Secure page** first.

## Running it

### On the PC

```powershell
pnpm dev
```

Open <http://127.0.0.1:1420/spikes/ink/>.

To test inside the real Windows web view (WebView2), run `pnpm tauri dev`,
press F12 in the app window, and run `location.href = '/spikes/ink/'` in
the console.

### On the tablet

The dev server normally listens only on this PC. `TAURI_DEV_HOST` opens it
to the local network.

1. Find the PC's address: run `ipconfig` and note the IPv4 address, for
   example `192.168.1.20`.
2. Start the server on that address:
   ```powershell
   $env:TAURI_DEV_HOST = '192.168.1.20'; pnpm dev
   ```
   Allow Node.js through Windows Firewall on private networks if asked.
3. On the tablet, in Chrome, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`,
   add `http://192.168.1.20:1420`, enable it and relaunch Chrome. This makes
   the page count as secure, so every pen feature is available.
4. Open `http://192.168.1.20:1420/spikes/ink/` and check that **Secure
   page** says Yes.

Chrome on Android uses the same engine as the Android web view that
Tauri uses, but draws to the screen slightly differently. Results from
Chrome are **provisional** until checked in a Tauri Android build (needs
Android Studio, planned for Phase 4).

## Test steps

For each setup below: press **Reset stats**, write the test sentence three
times at normal speed, press **Export results**, and score the feel from 1
(laggy) to 5 (like paper).

Test sentence: _Flies moved to fresh food 10:30, LPS 100 ug/mL, n = 24._

| Setup | Line             | Predicted | Low-latency | Raw updates |
| ----- | ---------------- | --------- | ----------- | ----------- |
| A     | perfect-freehand | On        | On          | Off         |
| B     | perfect-freehand | On        | Off         | Off         |
| C     | perfect-freehand | Off       | On          | Off         |
| D     | Simple           | On        | On          | Off         |
| E     | perfect-freehand | On        | On          | On          |

Then:

- **Full page:** with setup A, press **Add 2,000 strokes**, then write the
  sentence again. Note Full redraw, Ink file size and slow frames.
- **Palm rejection:** write a paragraph with your hand resting on the
  screen, as on paper. Count stray marks and missed scrolls with each palm
  rule on its own, then all together.
- **Scrolling:** scroll with a finger between lines of writing. Note any
  stroke that starts by mistake.

### Slow-motion video (the real latency)

The page can only time its own work. The delay from pen tip to visible ink
also includes the screen, so measure it on video:

1. Film the screen with a phone at 240 fps (one frame is about 4.2 ms).
2. Draw 10 quick straight lines.
3. For each line, count the frames between the pen tip stopping and the
   ink reaching it. Multiply by 4.2 ms.
4. Do the same in Samsung Notes as the native baseline.

## Pass mark

Set before measuring, so the result is not argued after the fact.

| Median pen-to-ink (video) | Decision                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------- |
| Under 50 ms               | **Go:** web ink in Phase 4                                                         |
| 50 to 80 ms               | **Go with tuning:** list the fixes needed                                          |
| Over 80 ms                | **No-go:** native ink view for ink only (Tauri plugin), not a full Flutter rewrite |

Also needed for Go: no slow frames while writing on the 2,000-stroke page,
and no stray marks with the palm rules on.

## Results

Device: Galaxy Tab S10 ___, Android ___, Chrome ___

| Setup | Input to drawn, median (ms) | 95% (ms) | Pen samples per s | Slow frames | Feel (1 to 5) |
| ----- | --------------------------- | -------- | ----------------- | ----------- | ------------- |
| A     |                             |          |                   |             |               |
| B     |                             |          |                   |             |               |
| C     |                             |          |                   |             |               |
| D     |                             |          |                   |             |               |
| E     |                             |          |                   |             |               |

Full page: full redraw ___ ms, ink file ___ KB, slow frames while writing ___

Palm rejection (stray marks per paragraph):

| Rules                     | Stray marks | Notes |
| ------------------------- | ----------- | ----- |
| Fingers scroll only       |             |       |
| Ignore touch near the pen |             |       |
| Ignore large touches      |             |       |
| All three                 |             |       |

Video, median pen-to-ink: BenchWork ___ ms, Samsung Notes ___ ms

Windows (WebView2): input to drawn median ___ ms, feel ___

## Decision

_To be filled in after measuring._
