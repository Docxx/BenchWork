# Projects

Switch on **Research** in Settings > Modules, then open **Projects** under Tools. Existing
projects are recognised automatically. You can search by name or aim and filter active, paused
and finished projects.

**New project** creates an ordinary notebook with a `project.md` hub and **Notes**, **Experiments**
and **Data** sections. It does not create another vault or move existing content.

Open a project to see its **Notes**, **Experiments**, **Files** and **Tasks**. The note side panel
is hidden in Projects and returns when you open a page. Folder contents belong
to the nearest project; nested projects keep their own contents. Pages and records elsewhere
that link to the project's hub are included too. Two hubs in a shared folder require explicit
links, so their contents are not mixed automatically.

- **Project page** opens the hub in the usual editor, where its aim and status can be changed.
- **New note** and **New experiment** create pages in the project's sections and link them to
  its hub.
- **Files** includes ordinary attachments and data files, not just indexed notes.
- **Tasks** lists actual checklists in the project pages, including completed items. Select a
  task to open its source page and edit it. Examples in code blocks are excluded. The Tasks
  module's existing list and board continue to use the same page checklists.
- The **Projects** button above an open page returns to its containing project.

The project view follows file changes, including changes arriving through sync. Switching
Research off leaves the notebooks, hub pages, notes, experiments and attachments in place.

## Module picker

Settings > Modules shows a card for each installed module, with an icon, description, status
and switch. Search, category and enabled-status filters, packs, dependency confirmation and
per-module configuration work as before. An expanded configuration card uses the full width.
The cards use the current BenchWork theme.

The Windows installer for this update is `artifacts/benchwork/BenchWork_0.22.0_x64-setup.exe`.
Validation: 1,119 JavaScript tests, 84 native tests, module-pack and Research browser workflows,
project creation and grouping, module filters and keyboard navigation, lint and the Windows build.
