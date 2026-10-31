# BenchWork roadmap

Current phase: **Phase 7**

## Phase 0: Skeleton

- [x] Tauri 2 + React + TypeScript project scaffold (pnpm, ESLint, Prettier, Vitest)
- [x] Open or create a vault folder; remember last vault
- [x] File tree sidebar
- [x] Settings page (theme, vault options)
- [x] Module registry, manifest format and src/core/api stub
- [x] Modules panel with on/off toggles, saved to .benchwork/config.json
- [x] Dummy module proving toggle on/off without touching vault files
- [x] Exit check: app builds on desktop, dummy module toggles cleanly

## Phase 1: Notes core

- [x] Notebook > Section > Page sidebar (folders and files)
- [x] TipTap block editor with slash menu, no visible Markdown, saved as Markdown
- [x] Editor document model on Yjs from the start (co-editing ready, single user for now)
- [x] Daily notebook: one page per day, linking into project notebooks
- [x] Paste screenshots, drag in files, autosave
- [x] Sample notebook created on first launch
- [x] YAML frontmatter with stable UUIDs
- [x] Wikilinks, backlinks, tags
- [x] Templates and daily note
- [x] SQLite index with FTS5 full-text search
- [x] Local snapshots for recovery
- [x] Spike: pen canvas prototype (pressure, palm rejection) to test ink latency (Go: see spikes/ink/RESULTS.md)
- [x] Exit check: lab notes written and searched on desktop

## Phase 2: Research core

- [x] Projects (folder + project.md hub)
- [x] Experiment note type
- [x] Dataset records (.dataset.yaml) with SHA-256 checksums and external paths
- [x] Attachments with copy-or-link prompt (size threshold in Settings, default 50 MB)
- [x] CSV, Excel, image and PDF previews
- [x] Exit check: an experiment links to its data and both appear in search

## Phase 3: First modules

- [x] Lab notebook module
- [x] References module (Zotero)
- [x] Exit check: daily pages with citations from the Zotero library

## Phase 4: Android tablet and ink

Back on 28 Oct 2026, after 0.6.0. Pen writing goes on free layout pages and in ink blocks, so there is no separate canvas page type.

- [x] Ink files (`.ink.json`), stroke drawing and palm rejection
- [x] Drawing surface and pen toolbar (pen, highlighter, eraser)
- [x] Core pen writing: ink blocks in document pages, ink boxes on free layout pages
- [x] Tablet layout: touch targets, sliding sidebar, quick capture
- [x] Android tablet build (Galaxy Tab S10), with All files access and a vault folder browser
- [x] Folder sync via Syncthing (PC and tablet) with conflict handling
- [x] Handwriting module (advanced ink: lasso, shapes)
- [x] Exit check: a note started on desktop is finished with a pen on the tablet

## Phase 5: Writing and planning

- [x] Manuscript (Pandoc export)
- [x] Planner (Gantt)
- [x] Mind maps and canvas
- [x] Data viewer: CSV and Excel light editing (cells, columns, simple formulas), quick plots
- [x] Exit check: a chapter draft exported to Word with formatted citations

## Between phases: new look and free layout (0.6.0)

- [x] New look: themes, accent colour, fonts, text size, spacing, page width, light or dark
- [x] Sidebar and side panel (outline, linked from), both resizable
- [x] Free layout pages: boxes placed anywhere, sticky notes, chosen per page with a per-vault default
- [x] Toolbar above pages: Home and Insert, can be hidden
- [x] Page colour and pattern (plain, dots, lines, grid)
- [x] Short opening animation

## Phase 6: Lab tools and polish

Planned 28 Oct 2026. Syncthing keeps devices in step, so BenchWork's own sync moves to Phase 7.

- [x] 6a. References Library panel folded until opened
- [x] 6a. Vault backups: dated copies of the whole vault on a schedule, and restore
- [x] 6b. Tasks and Kanban module: checklists from every page, due dates, a board
- [x] 6c. Inventory module: stocks, reagents, antibodies, fly stocks and crosses, flip reminders
- [x] 6d. PDF reading with the pen: highlights and ink in a sidecar file, the PDF untouched
- [x] 6e. Handwriting to text on the tablet (ML Kit), found by search on every device
- [x] 6f. Analysis bridge module: run a Python script on a dataset and attach its outputs (PC only)
- [x] 6g. First-run setup with module packs (Research, General notes)
- [ ] Exit check: a week of lab work: flips and tasks on today's page, a paper annotated with the pen on the tablet and its notes found on the PC, analysis outputs attached to a dataset, and a backup restored

## Tweaks before Phase 7

Planned 30 Oct 2026, released as 0.9.0.

- [x] Home page, opened at start, with a Home button; cards can be moved and hidden
- [x] Tools in the sidebar and on Home, a Canvases list, and a mind map button on every page
- [x] Lab tools module: calculators for solutions, DNA, protein and cells, units, recipes and timers
- [x] Latest papers module: topics followed through Europe PMC, the app's first use of the internet
- [x] Canvas styles: colours, borders, shapes and links for cards; colours, lines and heads for arrows
- [ ] Checked on the tablet: Home, Lab tools beside a page, and papers fetched over the tablet's connection

## Polish before Phase 7

Planned 30 Oct 2026, released as 0.10.0.

- [x] No system title bar on the computer: the app's own window buttons, dragged by its top
- [x] A new logo: the app icon, the sidebar's mark and the opening animation
- [x] Widgets placed on Home, under the notebooks, or in either half of the right side
- [x] Calendar, reminders and a large timer for Home and the docks
- [x] Six fun themes, from Starship bridge to Red planet
- [x] Word documents open in BenchWork, and in Word
- [x] Richer tasks (start, priority, progress, people, waiting, subtasks) and a planner chart of BenchWork's own
- [ ] Checked on the PC: no title bar, resizing the window, papers fetched, Word opened
- [ ] Checked on the tablet: widgets, themes and the planner with the pen

## More polish before Phase 7

Planned 31 Oct 2026, released as 0.11.0.

- [x] The window moves by pressing anywhere on the top bars, and maximises with a double press
- [x] Home's cards move and resize by dragging in Edit home, and stay put when done
- [x] Seven more themes, from Galaxy far away to Deep ocean
- [x] A first-run guide: how it works, a vault, modules, a theme and Home; again from Settings
- [x] The Hello module is gone
- [x] The notebooks list: icons, sorting, page counts, Favourites, row sizes and lines
- [x] The tablet no longer slows down re-reading its own files
- [x] Checked on the PC: moving the window, Home's grid, the new themes and the guide
- [x] Checked on the tablet: the planner opening quickly, Home's grid and the notebooks list

## Phase 7: Own sync and co-editing

- [ ] Native CRDT sync (Yjs) with end-to-end encryption, without Syncthing
- [ ] Live co-editing with accounts
- [ ] Choose the server host (self-hosted or a low-cost cloud host)

## Phase 8: Apple port

- [ ] macOS build (needs a Mac or macOS CI runner)
- [ ] iPad build with Apple Pencil support
- [ ] Apple developer account, signing and TestFlight
