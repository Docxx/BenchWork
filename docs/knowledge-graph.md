# Tags, graph and workspace layout

Home and document previews fill the available workspace. Home cards stack according
to the actual content width, including when either side panel is open. Note reading
width stays configurable under **Settings > Appearance > Page width**, with a new
**Fill available space** option. Home editing lives in the toolbar above the artwork.

Every tool page has a **Dock tool** menu. Choose either right-hand dock or the area
under the notebooks. The dock selects the tool immediately; its menu can move or
close it later. Lab tools uses its compact calculator interface in a dock, with
answers insertable into the current note. Full-page calculators use the remaining
workspace and stack their navigation and fields at smaller widths.

## Tags

Use **Add tags** above a note or document preview. Enter submits; commas or spaces
separate multiple tags. Nested tags such as `project/flies` work. Tags ignore case.
Click a chip to search; its small remove button removes that tag.

- Note tags live in the note's existing YAML frontmatter. Inline `#tags` also appear
  in the graph and existing tag search.
- Document tags live in `.benchwork/file-tags.json`, a durable JSON mapping from
  vault-relative file paths to tag lists. PDF, Word and other original files stay
  untouched. Include this metadata file in vault transfers and synchronisation.
- Changes use atomic writes and a serial queue. Unreadable metadata is not replaced.
  In-app file and folder renames move document tags too. External moves currently
  require reassigning the document tags; stale entries are retained for recovery.
- Note tag editing uses the editor save path, including conflict checks and save
  recovery. Document tags are included in `#tag` search results.

## Knowledge graph

Open **Knowledge graph** under Tools, or use its button above a note for a local
graph of two connection hops. It is an optional module and can be switched off
without changing any files. Research and General notes packs include it.

The graph reads notes, YAML records, document previews, images and canvases. It
resolves existing wiki and Markdown links using the core link resolver. Shared tags
add separate tag nodes when enabled; unlinked files can be shown or hidden.

Drag the background to pan, drag a node to reposition it, scroll or pinch to zoom,
and double-click a file to open it. Selection highlights its immediate connections.
The file list below the graph provides keyboard navigation. On the canvas, `+` and
`-` zoom, `0` fits, and Escape clears selection.

**Appearance** controls palettes (Aurora, Ember, Nebula, or the app theme), grouping
colours, node size, spacing, connection brightness, labels, glow, shared tags,
unconnected files and optional animated signals. **Save style** stores the settings
in `.benchwork/modules/knowledge-graph/appearance.json`. The graph never changes
notes or documents. Motion respects the app setting, reduced-motion preference and
page visibility. Positions are regenerated when the graph is refreshed.

Refresh reloads the graph, including metadata changes from outside the app.
Ordinary vault file changes also refresh automatically. Unreadable text files remain
as nodes and are listed in a visible warning. Binary document contents are not read
to infer semantic relationships: their links come from notes and shared tags.

The module uses `ctx.app.graph()` for a snapshot of files, tags, resolved links and
read warnings. Rendering and a spatial-bucket force layout use the browser canvas;
there is no network service or new dependency.
