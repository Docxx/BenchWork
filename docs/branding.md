# Open Record branding

The chosen BenchWork identity is an open laboratory notebook: electric-blue pages,
two pale writing lines and a magenta ink trace. The wordmark uses the already bundled
Source Serif 4 Variable font. Brand colours stay fixed across themes, with a navy
tile to keep the mark readable on light and dark surfaces.

The shared geometry and palette are in `src/core/ui/brand/open-record.json`.
`Logo.tsx` draws those paths directly as SVG, including an optional transparent or
single-colour mark. The sidebar, vault picker, first-run guide and splash use this
component. The splash writes the entry and trace, following existing startup and
reduced-motion preferences.

Editable and reusable exports:

- `assets/branding/open-record.svg`: transparent colour mark.
- `assets/branding/open-record-white.svg`: transparent single-colour mark.
- `assets/branding/1024x1024.png`: high-resolution navy app tile.
- `src-tauri/icons/logo.svg`: editable navy app tile.
- `public/favicon.svg`: browser tab icon.

Run `pnpm branding` after editing the shared geometry. It uses the installed Tauri
CLI to generate Windows, macOS, iOS and Android icons without new dependencies.
Android foreground, background and monochrome layers are generated separately;
Android 13 themed icons use the monochrome layer. The script also updates icon
resources in the existing generated Android project. App identifiers and vault data
are unchanged. Installed app icons appear after rebuilding and installing the app.
