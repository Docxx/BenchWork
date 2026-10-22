# BenchWork roadmap

Current phase: **Phase 1**

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
- [ ] Daily notebook: one page per day, linking into project notebooks
- [ ] Paste screenshots, drag in files, autosave
- [ ] Sample notebook created on first launch
- [ ] YAML frontmatter with stable UUIDs
- [ ] Wikilinks, backlinks, tags
- [ ] Templates and daily note
- [ ] SQLite index with FTS5 full-text search
- [ ] Local snapshots for recovery
- [x] Spike: pen canvas prototype (pressure, palm rejection) to test ink latency (Go: see spikes/ink/RESULTS.md)
- [ ] Exit check: lab notes written and searched on desktop

## Phase 2: Research core

- [ ] Projects (folder + project.md hub)
- [ ] Experiment note type
- [ ] Dataset records (.dataset.yaml) with SHA-256 checksums and external paths
- [ ] Attachments with copy-or-link prompt (size threshold in Settings, default 50 MB)
- [ ] CSV, Excel, image and PDF previews
- [ ] Exit check: an experiment links to its data and both appear in search

## Phase 3: First modules

- [ ] Lab notebook module
- [ ] References module (Zotero)

## Phase 4: Android tablet and ink

- [ ] Android tablet build (Galaxy Tab S10) and touch layout
- [ ] Core pen writing: ink blocks in document pages (S Pen pressure, palm rejection)
- [ ] Canvas page type
- [ ] Handwriting module (advanced ink: lasso, shapes)
- [ ] Folder sync via Syncthing (PC and tablet) with conflict handling

## Phase 5: Writing and planning

- [ ] Manuscript (Pandoc export)
- [ ] Planner (Gantt)
- [ ] Mind maps and canvas
- [ ] Data viewer: CSV and Excel light editing (cells, columns, simple formulas), quick plots

## Phase 6: Sync and polish

- [ ] Native CRDT sync (Yjs), then live co-editing with accounts
- [ ] Backups and version history
- [ ] Inventory, Analysis bridge, Tasks
- [ ] Onboarding with role-based module packs (Research pack first)
- [ ] Handwriting-to-text search and PDF annotation

## Phase 7: Apple port

- [ ] macOS build (needs a Mac or macOS CI runner)
- [ ] iPad build with Apple Pencil support
- [ ] Apple developer account, signing and TestFlight
