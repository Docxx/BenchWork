# BenchWork roadmap

Current phase: **Phase 4**

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

## Phase 4: Android tablet and ink (deferred)

Deferred on 23 Oct 2026 until Android Studio and the tablet are set up. Phase 5 goes first; this phase comes back after it.

- [ ] Android tablet build (Galaxy Tab S10) and touch layout
- [ ] Core pen writing: ink blocks in document pages (S Pen pressure, palm rejection)
- [ ] Canvas page type
- [ ] Handwriting module (advanced ink: lasso, shapes)
- [ ] Folder sync via Syncthing (PC and tablet) with conflict handling

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

## Phase 6: Sync and polish

- [ ] Native CRDT sync (Yjs), then live co-editing with accounts
- [ ] Backups and version history
- [ ] Inventory, Analysis bridge, Tasks
- [ ] Onboarding with role-based module packs (Research pack first)
- [ ] Handwriting-to-text search and PDF annotation
- [ ] Rethink the References Library panel: it is always open in the sidebar and takes up room (for example folded until opened, or shown in the references notebook)

## Phase 7: Apple port

- [ ] macOS build (needs a Mac or macOS CI runner)
- [ ] iPad build with Apple Pencil support
- [ ] Apple developer account, signing and TestFlight
