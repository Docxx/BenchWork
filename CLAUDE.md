# BenchWork: conventions

Local-first research workspace. Full spec in SPEC.md. Current work in ROADMAP.md.

## Rules

- Read SPEC.md before any new feature. Work only on the current ROADMAP.md phase.
- Plan first, then code. Propose file structure and APIs before writing them.
- TypeScript strict mode. pnpm. ESLint + Prettier.
- Stack: Tauri 2, React, TypeScript, TipTap (ProseMirror) block editor, SQLite (FTS5), Zustand, Vitest, Playwright.
- Product feel: OneNote ease, Obsidian power. Users never see Markdown syntax; pages are saved as Markdown on disk.
- Navigation is Notebook > Section > Page (folders and files). Core terms stay generic; research features live in modules.
- Advanced features (backlinks, graph, properties) stay hidden until used.
- Minimal interface: clean page, tools on demand; pen toolbar appears only when a pen is detected.
- Single user first, but build the editor on TipTap's Yjs (CRDT) binding from phase 1 so live co-editing can be added later without a rewrite.
- Data files: copy small files into the vault, link large ones (path + SHA-256); threshold set in Settings, default 50 MB.
- Ink is stored as vector strokes; recognised text (when added) is saved beside the strokes. PDF annotations live in a sidecar file; never modify the original PDF.
- Licence undecided: avoid GPL-only dependencies.
- Core code in src/core; each module in src/modules/<id>/ with manifest.json.
- Modules import only from src/core/api. Never from core internals.
- Disabling a module must never delete or rewrite user files.
- Vault files are the source of truth; .benchwork/index.sqlite is disposable and rebuildable.
- Every feature ships with Vitest tests; UI flows get a Playwright test.
- Run `pnpm test` and `pnpm lint` before declaring a task done.
- Ask before adding a new dependency.
- Targets: Windows desktop and Android tablet first; Apple (macOS, iPad) later.
- Keep platform-specific code (file access, storage paths, pen input, sharing) behind adapters in src/core/platform, so an Apple port adds adapters rather than rewrites.
- Use pointer events for pen input; never Android-only APIs in shared UI code.
- Tick items in ROADMAP.md as they land. Commit in small, descriptive steps.

## Writing style for UI text and docs

- UK English. No em dashes. Short, plain labels.
