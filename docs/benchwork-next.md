# BenchWork Next

A separate experimental edition of BenchWork, built for Ray as an exploration of what the
workspace could become. It has its own entry point, build output, app identifier and installer.
The existing BenchWork entry point and installed application are retained.

## Open it

- **Windows:** `artifacts/benchwork-next/BenchWork Next.exe` runs the portable app.
- **Installer:** `artifacts/benchwork-next/BenchWork Next Setup.exe` installs **BenchWork Next**
  alongside BenchWork, under the identifier `app.benchwork.next`.
- **Development:** `pnpm next:dev`, then open `http://127.0.0.1:1440/next.html`.
- **Build:** `pnpm next:build` writes to `dist-next`, keeping the normal `dist` build separate.
- **Package:** `pnpm next:package` builds the Windows app and copies both delivery files to
  `artifacts/benchwork-next`.

## What works

The studio starts with clearly marked fictional research, synthetic chart data and example
reading notes. It never opens the existing BenchWork vault or connects to its relay.

- **Overview:** project progress derived from task completion, next steps, recent notes and activity.
- **Projects:** create projects and tasks; edit steps; move cards by drag or accessible status
  menus; switch between a board and a list.
- **Notebook:** BenchWork's real TipTap/Yjs editor, plain Markdown files, autosave, blocks,
  formatting, wikilinks and snapshots. Quick capture creates actual notebook files.
- **Evidence:** collect sources, annotate interpretations, star items, mark reading progress,
  filter and search, edit shared tags, follow related items and create reading notes.
- **Constellation:** interactive, draggable project, note and source nodes. Solid lines mean
  project membership; dashed lines mean shared tags. These relationships are organisational,
  not scientific inferences.
- **Protocol lab:** editable workflows and step instructions, recorded steps, reminder timers,
  observations and a generated run report
  that opens in the notebook. The example does not replace a validated laboratory method.
- **Figure studio:** the full existing BenchWork figure editor, with an editable example chart,
  real-size layouts, image import and SVG, PNG, TIFF and PDF exports.
- **Focus room:** an immersive timer with wall-clock deadlines, pause/resume, session totals,
  a persistent intention, adjustable duration and optional motion. The timer follows you between views.
- **Modules:** enable or hide studio tools without deleting data; open the existing whiteboard,
  mind-map/canvas and lab-tool modules.
- **Command search:** Ctrl+K finds tools, projects, sources, note titles and indexed note body text.
  Arrow keys and Enter work in the palette. Ctrl+Shift+N captures a thought.
- **Appearance:** light and dark themes, reduced-motion support, mobile navigation and layouts.

## Storage and portability

This edition uses the existing `MemoryAdapter` with an isolated IndexedDB persistence layer.
The adapter's atomic file writes wait for the durable database transaction. Save failures are
shown with a retry action; unsaved content remains in the open studio. Native window closing
waits for the core editors, modules and storage queue. All notebook, figure and attachment bytes
are kept, including binary files.

The database is `benchwork-next-studio-v1`; it is separate from the ordinary BenchWork app and
from that app's filesystem vault. Browser editions are also separated by browser origin. Clearing
the browser or WebView's site data removes that local copy, so keep an export of work you care about.

The workspace menu exports a portable JSON archive. In the Windows app it also writes an ordinary
vault folder with the Markdown, figures and attachment files. Native exports always create a new
folder and never overwrite existing exports. Imports are size-limited, path-checked, decoded and
validated in a temporary adapter, then reviewed before replacing the open studio.

The research model is stored as `.benchwork/next/workspace.json`. The archive preserves the rest of
the BenchWork vault, including snapshots and existing module files. Device-only timer preferences
and the current timer use session storage. An unfinished run's observations remain in the current
session; save a run report to retain them in the durable notebook.

This is an experimental local studio. Cloud replication, accounts, automated scientific
interpretation and external AI are not connected. Existing core modules remain available, while
the new studio views are composed in `src/next` so the original app can evolve independently.

## Validation

Vitest covers progress, relationships, metadata validation, timer deadlines and binary archive
round-trips. Playwright covers persistence, save failure and retry, imports and export, the core
editor, evidence, protocol reports, timers, the figure editor, keyboard search and phone layouts.
The existing BenchWork test and lint commands continue to apply.

Validated on 14 November 2026: 1,114 JavaScript tests, 84 native tests and nine studio browser
workflows passed. Lint and both production builds passed. The packaged Windows app was opened,
a welcome note was saved, and its persistence was verified after a full close and restart.
