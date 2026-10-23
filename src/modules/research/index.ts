import { createElement } from 'react';
import { defineModule, type ModuleContext } from '@core/api';
import { DatasetView } from './DatasetView';
import { checkFile, DATASET, DATASET_ENDING, datasetFiles } from './datasets';
import { experimentType, newProject, projectType } from './projects';
import './research.css';

/**
 * The Research module: projects, experiment pages and dataset records.
 * Everything it makes is a normal vault file (pages and YAML records), so
 * switching it off leaves them all in place: experiments open as ordinary
 * pages, and dataset records show as read-only values.
 */

/** Creates a dataset record in `folder` and opens it. */
async function newDataset(ctx: ModuleContext, folder: string | null): Promise<void> {
  if (folder === null) {
    ctx.app.notify('Choose New dataset from a notebook or section menu.');
    return;
  }
  const name = await ctx.app.askText({ title: 'New dataset', label: 'Dataset name' });
  if (name === null) return;
  const safe = name.replace(/[\u0000-\u001f<>:"/\\|?*]/g, '-').replace(/[. ]+$/, '');
  if (safe === '') return;
  const path = await ctx.vault.createRecord(folder, safe, DATASET, { description: '', files: [] });
  await ctx.app.open(path);
}

/** Checks every dataset's files, and says what it found. */
async function checkAllDatasets(ctx: ModuleContext): Promise<void> {
  const datasets = (await ctx.app.items()).filter((i) => i.type === DATASET);
  let checked = 0;
  const problems: string[] = [];
  for (const dataset of datasets) {
    const { data, error } = await ctx.vault.readRecord(dataset.path);
    if (error !== null) {
      problems.push(`${dataset.title} could not be read`);
      continue;
    }
    for (const file of datasetFiles(data)) {
      const state = await checkFile(ctx.vault, file);
      checked += 1;
      if (state === 'changed') problems.push(`${file.path} in ${dataset.title} has changed`);
      if (state === 'missing') problems.push(`${file.path} in ${dataset.title} is not found`);
      if (state === 'unreadable')
        problems.push(`${file.path} in ${dataset.title} could not be read`);
    }
  }
  const files = `${String(checked)} ${checked === 1 ? 'file' : 'files'}`;
  ctx.app.notify(
    problems.length === 0
      ? `Checked ${files} in ${String(datasets.length)} datasets. All are unchanged.`
      : `Checked ${files}. ${problems.join('. ')}.`,
  );
}

export default defineModule({
  activate(ctx) {
    ctx.pageTypes.register(projectType());
    ctx.pageTypes.register(experimentType(ctx));

    ctx.commands.register({
      id: 'research.newProject',
      title: 'New project',
      places: ['new'],
      run: () => newProject(ctx),
    });
    ctx.commands.register({
      id: 'research.newDataset',
      title: 'New dataset',
      places: ['folder'],
      run: ({ folder }) => newDataset(ctx, folder),
    });
    ctx.commands.register({
      id: 'research.checkDatasets',
      title: 'Check all dataset files',
      run: () => checkAllDatasets(ctx),
    });

    ctx.files.register({
      id: 'research.dataset',
      extensions: [DATASET_ENDING],
      name: 'Dataset',
      render: ({ path }) => createElement(DatasetView, { ctx, path }),
    });
  },
});
