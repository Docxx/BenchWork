# BenchWork: Project Spec and Architecture

Oct 22, 2026 · Ray Price

## Overview

A local-first workspace combining OneNote's ease of use with Obsidian's power: notebooks, pages and pen writing that work on first launch, built on plain files, links and add-on modules. Researchers first, on a generic core that can expand later. **Name: BenchWork**.

**Target users:** PhD students, postdocs and lab researchers first, who currently split work across OneNote, Obsidian, Zotero, Excel, GoodNotes and shared drives. Students and general note-takers later, through other module packs.

**Design principles**

- **OneNote ease, Obsidian power:** notebooks, pages and pen writing out of the box; links, plain files and modules underneath.
- **Local-first:** all content lives as plain files in a folder (the vault) on the user's device. The app works fully offline.
- **Open formats:** Markdown, YAML, JSON and standard data files. Nothing locked into a proprietary database.
- **Progressive power:** backlinks, graph, tags and properties stay hidden until used. Beginners never see syntax.
- **Small core, optional modules:** the core does pages, ink, files and search well. Everything else is a module, grouped into packs by role, and can be disabled without breaking the core or deleting data.
- **Research first, generic core:** the core uses neutral terms (notebook, section, page). Experiments, datasets and references come in the Research pack, leaving room for other packs.
- **Cross-device:** Windows and Android tablet with S Pen first; macOS and iPad later, from the same codebase.
- **Not an institutional ELN:** a personal research hub. Official records stay in whatever system the institution mandates.

## Product decisions

Single user first, with live co-editing designed in from the start and built later. Decided 22 Oct 2026.

| Area         | Decision                                            | Consequence for the build                                                                                                                                              |
| ------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audience     | Single user (Ray) first                             | No accounts at launch; public-release polish later                                                                                                                     |
| Sharing      | Live co-editing, later                              | Editor built on TipTap's Yjs (CRDT) binding from phase 1, so co-editing reuses the same document model; sync server and accounts from phase 6                          |
| Data files   | Ask each time                                       | Small files copied into the vault, large ones linked with path and checksum; size threshold in Settings (default 50 MB)                                                |
| Data types   | CSV and Excel, images, PDFs                         | Previews for all three in core                                                                                                                                         |
| Spreadsheets | Light editing                                       | Edit cells, add columns, simple formulas; save back to CSV or XLSX                                                                                                     |
| Lab notebook | Free notes                                          | No locking; version history for recovery                                                                                                                               |
| Handwriting  | Searchable, convert to text, PDF annotation, shapes | Vector strokes; recognition on the tablet (ML Kit), text stored beside the strokes so the PC can search it; PDF annotations in a sidecar layer, original PDF untouched |
| References   | Zotero                                              | References module targets Zotero only at first                                                                                                                         |
| Interface    | Minimal                                             | Clean page, tools on demand; pen toolbar appears when the S Pen is detected                                                                                            |
| Organisation | Projects plus daily pages                           | A notebook per project; a Daily notebook with a page per day linking into projects                                                                                     |
| Tablet use   | Bench notes, papers, meetings, sketching            | Large touch targets, quick-capture button, PDF reader with pen, canvas pages                                                                                           |
| Licence      | Undecided                                           | Private repo; avoid GPL-only dependencies so any licence stays open                                                                                                    |

## Core app scope

The core is a generic notebook app that works on first launch with no setup. Research features arrive as modules.

| Capability             | What it includes                                                                                                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navigation             | Notebook > Section > Page sidebar, mapped to folders and files; drag to reorder; section colours; recent pages                                                                               |
| Editor                 | Block editor with no visible Markdown; `/` menu for headings, tables, checklists, images, ink and embeds; `[[` or `@` link autocomplete; paste screenshots; drag in files; autosave          |
| Page types             | **Document page** (default): flowing text, where touching the pen to the page inserts an ink block at that point. **Canvas page:** freeform surface for sketches, diagrams and whiteboarding |
| Ink                    | Pen, highlighter and eraser in ink blocks and canvas pages; pressure; palm rejection                                                                                                         |
| Links and organisation | Backlinks, tags, page properties and templates, hidden until first used                                                                                                                      |
| Files                  | Images, PDFs and any file embedded or attached; previews for common types                                                                                                                    |
| Search and settings    | Full-text search across pages; Settings with theme, vault options and the **Modules** panel                                                                                                  |
| First launch           | Creates a vault with a sample notebook; asks "What do you do?" and enables the matching module pack                                                                                          |

**Out of core:** experiments, datasets, references, manuscripts, Gantt, mind maps, inventories, advanced ink and sync beyond a shared folder. These arrive as modules, grouped into packs, with the Research pack first.

**Core acceptance test:** a new user installs the app, writes a page with typed text and pen notes, links two pages and finds both in search, offline, without opening any help.

## Add-on module system

Every add-on is a module with a manifest, registered at startup and switched on or off in **Settings > Modules**. Built-in modules ship with the app; a third-party module API can come later on the same contract.

**Rules**

- Disabling a module never deletes its data. Its files stay in the vault and reappear when re-enabled.
- Modules talk to the core only through the public module API, never core internals.
- A module may depend on another (Manuscript needs References); enabling it prompts to enable its dependencies.
- Each module stores its files in normal vault folders and its private state in `.benchwork/modules/<id>/`.
- With a module off, its content degrades gracefully: a `gantt` code block shows as plain text, an ink embed shows a placeholder.

**Module manifest (example)**

```json
{
  "id": "references",
  "name": "References",
  "version": "0.1.0",
  "description": "Zotero library, citation keys and literature notes",
  "dependsOn": [],
  "platforms": ["desktop", "tablet"],
  "defaultEnabled": false
}
```

**Extension points the core exposes**

| Extension point | Used for                                            | Example                  |
| --------------- | --------------------------------------------------- | ------------------------ |
| Commands        | Actions in the command palette and menus            | "Insert citation"        |
| Views           | Sidebar panels and full-page tabs                   | Gantt chart tab          |
| Block renderers | Rendering custom blocks inside pages                | `mindmap` block          |
| File handlers   | Opening custom file types                           | `.ink.json` pages        |
| Page types      | New frontmatter `type` values with templates        | `type: stock`            |
| Settings panel  | The module's own options                            | Zotero API key           |
| Index hooks     | Adding fields to the search index                   | Citation keys searchable |
| Lifecycle       | `activate()` and `deactivate()` with clean teardown | Stop sync timers         |

## Planned add-ons

Ten modules, all off by default, ordered by build priority. Onboarding enables a pack by role: the Research pack switches on Lab notebook, References, Data viewer, Planner and Inventory, plus the experiment and dataset page types.

| Module               | What it does                                                                                                      | Likely libraries    | Depends on  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------- | ----------- |
| Lab notebook         | Daily pages linking into projects, protocol templates, version history; free editing, no locking                  | Core only           | None        |
| References           | Zotero sync (Web API or Better BibTeX), `[@citekey]` citations, literature notes, `.bib` export                   | citation-js         | None        |
| Handwriting          | Advanced ink on top of core pen writing: lasso, shapes, handwriting-to-text search (ML Kit), PDF annotation       | perfect-freehand    | None        |
| Data viewer          | CSV and Excel with light editing (cells, columns, simple formulas), quick plots, image previews, dataset gallery  | SheetJS, Plotly.js  | None        |
| Manuscript           | Assemble notes into a manuscript; figure and table numbering; word counts; export to Word and PDF with CSL styles | Pandoc              | References  |
| Planner (Gantt)      | Tasks and experiments on a timeline, dependencies, milestones                                                     | Frappe Gantt        | None        |
| Mind maps and canvas | Mind maps from outlines; free canvas linking notes, images and datasets                                           | Markmap, React Flow | None        |
| Inventory            | Stocks, reagents, antibodies; fly crosses and flip reminders                                                      | Core only           | None        |
| Analysis bridge      | Run local Python scripts (for example Buzzz) on a dataset and attach outputs; desktop only                        | Tauri shell API     | Data viewer |
| Tasks and Kanban     | Checklists across notes, a Kanban board, due dates                                                                | Core only           | None        |

**Later, outside the module list:** full multi-device sync (see Architecture), the Apple port (iPad and macOS) and PDF annotation with the Handwriting module.

## Architecture

One TypeScript codebase in a Tauri 2 shell, building native apps for Windows, macOS, iPad and Android from the same code. Plain files are the source of truth; a local SQLite index makes them fast to search and is rebuilt on each device.

**Layers, top to bottom**

1. Add-on modules (toggled in Settings)
2. Module API: commands, views, renderers, file handlers, index hooks
3. Core app (React + TypeScript): notebooks, block editor, ink and canvas, search, module registry
4. Tauri backend (Rust): file access, file watcher, SQLite index
5. Vault folder (source of truth), synced with other devices

Modules sit on top of the core and call it only through the module API, so switching one off never touches the vault.

**Stack**

| Layer       | Choice                                                      | Why                                                                                                           |
| ----------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| App shell   | Tauri 2                                                     | Desktop and mobile from one codebase; small installs; Rust backend for file access                            |
| UI          | React + TypeScript                                          | Largest library ecosystem for the add-ons; Claude writes it fluently                                          |
| Note editor | TipTap (ProseMirror) block editor on Yjs, saved as Markdown | OneNote-style editing with no visible syntax; slash menu; custom ink, data and embed blocks; co-editing ready |
| Ink         | Pointer Events with pressure + perfect-freehand on canvas   | S Pen and Apple Pencil pressure, tilt and palm rejection via `pointerType`                                    |
| Index       | SQLite with FTS5 full-text search                           | Fast search, backlinks and queries; disposable and rebuildable                                                |
| State       | Zustand                                                     | Simple, module-friendly store                                                                                 |
| Tests       | Vitest (unit), Playwright (end-to-end)                      | Lets Claude Code check its own changes                                                                        |

**Flutter considered:** better ink performance, but weaker editors and far fewer libraries for Gantt, mind maps and citations. Revisit only if ink latency in the web view proves unacceptable.

**Vault layout**

```
MyVault/
  .benchwork/
    config.json          # vault settings, enabled modules
    modules/<id>/        # module private state
    index.sqlite         # local only, never synced
  Daily/
    2026-10-22.md
  LPS model/             # notebook (folder)
    _section.yaml
    Experiments/         # section (folder)
      2026-10-21 LPS dose.md
    Data/
      climbing-day7.csv
      climbing-day7.dataset.yaml
    ink/
      2026-10-21-sketch.ink.json
  references/
    library.bib
    smith2024-tau.md
  templates/
  attachments/
```

**Sync, in two stages**

1. **Folder sync (phase 4):** the vault syncs between PC and Android tablet with Syncthing. The app excludes `index.sqlite`, detects conflict copies created by the sync service and offers a side-by-side merge.
2. **Native sync (phase 6):** a small sync service using the Yjs documents for conflict-free merging of edits and ink strokes, with end-to-end encryption; then live co-editing with accounts. Self-hosted or a low-cost cloud host.

**Large data:** raw imaging, DAM and video files stay on lab or university storage. The vault holds a dataset record with path, checksum and metadata, so notes link to data without copying it into sync.

## Data model

Every object is a file with a stable UUID in its frontmatter, so links survive renames and moves.

| Object             | Stored as                                  | Key fields                                                                                                   |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Page               | `.md` with YAML frontmatter                | `id`, `type`, `project`, `tags`, `created`, `modified`                                                       |
| Notebook / section | Folder + optional `_section.yaml`          | `colour`, `order`                                                                                            |
| Canvas page        | `.canvas.json`                             | `items[]` (text boxes, ink strokes, images, page embeds) with `x`, `y`, `width`, `height`                    |
| Experiment         | `.md`, `type: experiment` (Research pack)  | `aim`, `date`, `protocol`, `conditions`, `genotypes`, `datasets[]`, `status`                                 |
| Dataset            | `.dataset.yaml` sidecar (Research pack)    | `id`, `files[]` (path, size, sha256), `external` path, `instrument`, `acquired`, `experiment`, `description` |
| Ink                | `.ink.json`, embedded with `![[...]]`      | `strokes[]` (points: x, y, pressure, t), `tool`, `colour`, `width`, `recognisedText`                         |
| PDF annotations    | `<file>.pdf.annot.json` sidecar            | `page`, `strokes[]`, `highlights[]`; original PDF untouched                                                  |
| Reference          | `references/<citekey>.md` + `library.bib`  | `citekey`, `zoteroKey`, `doi`, `title`, `authors`, `year`                                                    |
| Protocol           | `.md`, `type: protocol`                    | `version`, `supersedes`, `steps`                                                                             |
| Link               | `[[wikilink]]` or `![[embed]]` in Markdown | Resolved by UUID or path in the index                                                                        |
| Index              | `.benchwork/index.sqlite`                  | Tables: `notes`, `links`, `tags`, `datasets`, `fts`; derived, rebuildable                                    |

**Experiment page (example)**

```markdown
---
id: 8f3c2a1e-4b7d-4e2a-9c11-2d5f6a7b8c90
type: experiment
project: LPS-model
date: 2026-10-21
aim: Dose response of LPS on climbing at day 7
protocol: '[[LPS feeding v3]]'
genotypes: [w1118, elav>tau]
datasets: ['[[climbing-day7]]']
status: running
tags: [lps, climbing]
---

## Notes

Flies transferred 10:30. ![[2026-10-21-sketch.ink]]
```

## Build roadmap

Eight phases, each ending in something usable. Phase 2 is the first point of daily use; tablet and handwriting arrive in phase 4. The live checklist is `ROADMAP.md`.

0. **Skeleton.** Tauri + React app; open or create a vault; file tree; Settings page; module registry with a Modules panel and on/off toggles. _Exit: app builds on desktop, a dummy module toggles on and off._
1. **Notes core.** Block editor (TipTap on Yjs) saving Markdown, notebook and section sidebar, Daily notebook, sample notebook on first launch, frontmatter, wikilinks, backlinks, tags, templates, SQLite index and full-text search. _Exit: lab notes written and searched on desktop._
2. **Research core.** Projects, experiment page type, dataset records with checksums, copy-or-link attachments, CSV, Excel, image and PDF previews. _Exit: an experiment links to its data and both turn up in search._
3. **First modules.** Lab notebook and References (Zotero). _Exit: daily pages with citations from the Zotero library._
4. **Tablet and ink.** Android tablet build with S Pen support, touch-friendly layout, pen writing in ink blocks, canvas pages, Handwriting module, folder sync with conflict handling. _Exit: a note started on desktop is finished with a pen on the tablet._
5. **Writing and planning.** Manuscript export via Pandoc, Planner (Gantt), Mind maps and canvas, Data viewer with light editing. _Exit: a chapter draft exported to Word with formatted citations._
6. **Sync and polish.** Native Yjs sync then co-editing, backups and version history, Inventory, Analysis bridge, onboarding with module packs, handwriting-to-text and PDF annotation. _Exit: two devices edit the same vault without conflict copies._
7. **Apple port.** macOS and iPad builds with Apple Pencil, signing and TestFlight. _Exit: BenchWork runs on an iPad from the same codebase._

## Working with Claude Code

`SPEC.md` (this file), `CLAUDE.md` (conventions) and `ROADMAP.md` (checklist) sit in the repo root. Build one phase at a time.

**Setup**

- [ ] Install Node.js LTS, pnpm, Rust and the Tauri 2 prerequisites (Visual Studio Build Tools with the C++ workload)
- [ ] Create a private GitHub repo and connect it to Claude Code
- [ ] Add `SPEC.md`, `CLAUDE.md` and `ROADMAP.md`
- [ ] Before phase 4: install Android Studio (SDK, NDK, JDK) and enable USB debugging on the tablet

**Workflow per phase**

1. Ask Claude Code to plan the phase against `SPEC.md` (plan mode) and review the plan before code.
2. Build feature by feature on a branch, with tests.
3. Test by hand on real devices; report bugs with screenshots and steps.
4. Merge, tick `ROADMAP.md`, tag a release.

**First prompt**

```
Read SPEC.md and CLAUDE.md. Plan Phase 0: a Tauri 2 + React + TypeScript
app that opens or creates a vault folder, shows a file tree, has a
Settings page, and has a module registry with a Modules panel where
modules toggle on and off. Include one dummy module to prove the toggle.
Propose the folder structure and the module API before writing code.
```

## Risks and open decisions

The two biggest risks are sync conflicts and ink responsiveness on tablets; both are deferred to phase 4 or later so the core is usable first.

| Risk                                | Impact                                   | Mitigation                                                                                           |
| ----------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Sync conflicts and data loss        | Lost notes or ink                        | Folder sync with conflict detection first; Yjs sync later; automatic local snapshots from phase 1    |
| Ink latency in the web view         | Writing feels laggy                      | Prototype a pen canvas early in phase 1 as a spike; Flutter fallback for the ink view only if needed |
| Apple port needs macOS              | No iPad build or signing from Windows    | Android first; platform code behind adapters; borrow a Mac or use a macOS CI runner at port time     |
| Mobile file access to cloud folders | Android cloud apps do not mirror folders | Syncthing between PC and tablet in phase 4; native sync before the Apple port                        |
| University-managed PC               | Admin prompts block installs and builds  | Admin By Request for installs; consider a personal PC for development                                |
| Scope creep                         | Competes with thesis time                | Strict phase order; no module work before phase 2 exit                                               |
| Mistaken for an official ELN        | Compliance gap                           | State the scope in the app; export notebook pages as PDFs for the official system                    |

**Decided:** name BenchWork; Android first (Galaxy Tab S10, S Pen), Apple later; single user first, live co-editing later; Zotero for references; minimal interface.

**Open decisions**

- [ ] Folder sync for phase 4: Syncthing, or bring native sync forward
- [ ] Licence: undecided; private repo for now
- [ ] Zotero connection: Web API key or local Better BibTeX
