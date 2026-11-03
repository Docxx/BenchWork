# Reading, analysis and writing

Enable **References**, **Handwriting**, **Research**, **Analysis bridge** and
**Manuscript** in Settings > Modules. The tools can be enabled separately.
No AI runs in this workflow.

## Reading desk

Add PDFs to your vault, then open **Reading desk**. References uses the existing
Zotero Better BibTeX CSL JSON library configured in References settings. It does
not connect to Zotero's servers or download attachments.

In a PDF, choose **Select text**, select a passage and choose:

- **Excerpt + comment** for a source excerpt and your observations.
- **Structured note** for an excerpt plus finding, methods, limitations and relevance headings.
- **Link evidence** to connect the excerpt to research questions, experiments or writing.

Choose a citation from your library and save. BenchWork remembers that PDF's
citation choice on later captures. Saved notes are ordinary Markdown pages of
type `evidence` in `Research/Evidence`. They preserve the excerpt, PDF path,
source page, annotation ID, source SHA-256, citation key and research links.
Capturing a note does not edit the PDF. Annotations remain in its `.annot.json`
sidecar. Existing highlights offer the same capture actions when selected.

## Analysis bridge

Select a dataset and configure your installed Python, Rscript or custom
executable. Nothing is installed automatically. Scripts run with your account's
normal permissions and can access whatever those programs normally access.
BenchWork records file hashes before and after; it cannot prevent a script
from changing its inputs.

Arguments support `{script}`, `{files}`, `{folder}`, `{output}`, `{name}` and
named `{param:name}` values. Add parameter defaults when editing a script and
override them for a run. Each substituted parameter remains a single argument;
BenchWork does not interpret it as shell commands.

Each run has a unique output folder beside its dataset, including:

- A `.analysis.yaml` record created before the process starts, including failed starts.
- A copy and SHA-256 of the main script, input paths, sizes, dates and hashes.
- Exact arguments, parameters, timestamps, status and exit code.
- Python/Rscript version when recognised, and `run.log` with stdout/stderr.
- Output paths and hashes, including nested output folders.
- Checks for changes to the original script and inputs during the run.

The original script runs so sibling imports still work. Its snapshot is limited
to 4 MB. Imported code, package environments and external services are not
captured; this is a provenance record, not a complete reproducible environment.
Captured scripts and inputs are not automatically uploaded anywhere.

Runs continue when you navigate away. Return to Analysis to stop an active run.
Disabling the module or closing the vault stops the process and waits for its
final record. An abrupt OS/process crash can leave a `running` record, which
should be treated as interrupted. Run history is available on both desktop and
tablet; executing programs requires a computer.

## Writing

Open **Writing**, create a research paper or thesis, then add sections. Existing
manuscripts can be selected, and existing writing sections can be attached.
Select a section to set its aim, status and word target and attach evidence
notes and analysis records. Save the plan, then choose **Write section** to use
the normal page editor.

Evidence cards preview the source excerpt, open the PDF at its source page and
can explicitly append its citation to a section. Analysis links open the saved
run record. Links live in section properties, keeping the draft's prose separate
from research context. The manuscript page lists sections in export order; use
the normal editor to reorder those links. **Word counts and export** uses the
existing Pandoc export workflow on a computer.

These files stay readable when a module is disabled. The knowledge graph can
follow their ordinary links. Full PDF annotation sync, automatic Zotero
attachment import, dependency/environment capture and the wider feedback and
automation workspaces are future additions.
