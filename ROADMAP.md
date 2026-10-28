# BenchWork roadmap

Current phase: **Phase 6**

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
- [ ] 6e. Handwriting to text on the tablet (ML Kit), found by search on every device
- [ ] 6f. Analysis bridge module: run a Python script on a dataset and attach its outputs (PC only)
- [ ] 6g. First-run setup with module packs (Research, General notes)
- [ ] Exit check: a week of lab work: flips and tasks on today's page, a paper annotated with the pen on the tablet and its notes found on the PC, analysis outputs attached to a dataset, and a backup restored

## Phase 7: Own sync and co-editing

- [ ] Native CRDT sync (Yjs) with end-to-end encryption, without Syncthing
- [ ] Live co-editing with accounts
- [ ] Choose the server host (self-hosted or a low-cost cloud host)

## Phase 8: Apple port

- [ ] macOS build (needs a Mac or macOS CI runner)
- [ ] iPad build with Apple Pencil support
- [ ] Apple developer account, signing and TestFlight
