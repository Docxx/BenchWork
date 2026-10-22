import { localTimestamp } from '../pages/frontmatter';
import { joinVaultPath, parentVaultPath, PlatformError, type PlatformAdapter } from '../platform';

/**
 * A "Getting started" notebook, written once when a vault is made in an
 * empty folder. It shows the main features by example and can be moved to
 * the Recycle Bin like any other notebook. Never added to a folder that
 * already has files.
 */

export const SAMPLE_NOTEBOOK = 'Getting started';

function welcome(id: string, created: string): string {
  return `---
id: ${id}
created: ${created}
tags: [getting-started]
---
# Welcome to BenchWork

BenchWork keeps your notes as plain files in this folder. Everything works offline.

## Find your way around

- **Notebooks** are the folders in the sidebar. **Sections** are folders inside them, and **pages** are your notes.
- Press **Today**, or Ctrl+Shift+D, for today's page in the Daily notebook.
- Press **Ctrl+E** to search every page.
- Type **/** on an empty line for headings, lists, checklists, tables and more.

## Link your notes

Type two square brackets to link to another page, like [[Example experiment]]. Pages that link here are listed at the foot of the page.

Add tags such as #getting-started anywhere in the text. Click a tag to see every page that has it.

## Pictures and files

Paste a screenshot, or drag a file onto a page. A copy is kept in the attachments folder.

## Templates

Right-click a notebook and choose **New page from template**. There is an Experiment template to start with, and you can save any page as a template from its menu.

## Nothing is lost

Pages save as you type. Use **History** at the top of a page to go back to an earlier version.

When you no longer need this notebook, right-click it and choose **Move to Recycle Bin**.
`;
}

function experiment(id: string, created: string): string {
  return `---
id: ${id}
created: ${created}
type: experiment
tags: [getting-started, example]
---
# Example experiment

**Aim:** see how a lab note looks in BenchWork.

## Method

- [x] Prepare samples
- [x] Run the assay
- [ ] Analyse the results

## Results

| Sample | Reading | Notes |
| --- | --- | --- |
| A | 4.2 | Control |
| B | 3.9 | Treated |

## Next steps

Plan the follow-up in today's daily page and link back here. See [[Welcome]] for more tips. #example
`;
}

const EXPERIMENT_TEMPLATE = `---
type: experiment
tags: [experiment]
---
# {{title}}

**Date:** {{date:D MMMM YYYY}}

**Aim:**

## Method

- [ ] First step

## Results

## Next steps
`;

/** The sample files, by vault path. */
export function sampleFiles(now: Date, newId: () => string): Record<string, string> {
  const created = localTimestamp(now);
  return {
    [`${SAMPLE_NOTEBOOK}/Welcome.md`]: welcome(newId(), created),
    [`${SAMPLE_NOTEBOOK}/Example lab notes/Example experiment.md`]: experiment(newId(), created),
    'templates/Experiment.md': EXPERIMENT_TEMPLATE,
  };
}

/** Writes the sample notebook. Never overwrites anything already there. */
export async function createSampleNotebook(
  platform: PlatformAdapter,
  now: Date = new Date(),
  newId: () => string = () => crypto.randomUUID(),
): Promise<void> {
  for (const [path, text] of Object.entries(sampleFiles(now, newId))) {
    await platform.ensureDir(parentVaultPath(joinVaultPath('', path)) ?? '');
    try {
      await platform.createNew(path, text);
    } catch (err) {
      if (PlatformError.from(err).kind !== 'AlreadyExists') throw err;
    }
  }
}
