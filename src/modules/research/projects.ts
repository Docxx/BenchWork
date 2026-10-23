import type { ModuleContext, PageTypeSpec } from '@core/api';

/**
 * Projects and experiments. A project is a notebook with a hub page,
 * `project.md`, and Experiments and Data sections. Experiments made inside
 * a project link to its hub, so the hub lists them under "Linked from".
 */

export const PROJECT_HUB = 'project';
export const SECTIONS = ['Experiments', 'Data'];

export const EXPERIMENT_STATUS = ['planned', 'running', 'done', 'stopped'];
export const PROJECT_STATUS = ['active', 'paused', 'finished'];

/** A day as `YYYY-MM-DD`, in local time. */
export function day(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The hub page of the project `folder` is in, or null if it is in none. */
export async function findProjectHub(
  ctx: Pick<ModuleContext, 'vault'>,
  folder: string,
): Promise<string | null> {
  const parts = folder === '' ? [] : folder.split('/');
  for (let n = parts.length; n > 0; n -= 1) {
    const hub = `${parts.slice(0, n).join('/')}/${PROJECT_HUB}.md`;
    if (await ctx.vault.exists(hub)) return hub;
  }
  return null;
}

export function projectType(): PageTypeSpec {
  return {
    type: 'project',
    name: 'Project',
    fields: [
      { key: 'aim', label: 'Aim', kind: 'text' },
      { key: 'status', label: 'Status', kind: 'choice', options: PROJECT_STATUS },
      { key: 'started', label: 'Started', kind: 'date' },
    ],
    create: ({ now }) => ({
      properties: { status: 'active', started: day(now) },
      body: [
        '## Aim',
        '',
        '## Experiments',
        '',
        'Experiments and datasets in this project are listed under Linked from, below.',
        '',
        '## Notes',
        '',
      ].join('\n'),
    }),
  };
}

export function experimentType(ctx: Pick<ModuleContext, 'vault' | 'app'>): PageTypeSpec {
  return {
    type: 'experiment',
    name: 'Experiment',
    fields: [
      { key: 'aim', label: 'Aim', kind: 'text' },
      { key: 'date', label: 'Date', kind: 'date' },
      { key: 'status', label: 'Status', kind: 'choice', options: EXPERIMENT_STATUS },
      { key: 'project', label: 'Project', kind: 'link' },
      { key: 'protocol', label: 'Protocol', kind: 'link' },
      { key: 'conditions', label: 'Conditions', kind: 'list' },
      { key: 'genotypes', label: 'Genotypes', kind: 'list' },
      { key: 'datasets', label: 'Datasets', kind: 'links' },
    ],
    create: async ({ folder, now }) => {
      const hub = await findProjectHub(ctx, folder);
      const project = hub === null ? {} : { project: `[[${await ctx.app.linkTarget(hub)}]]` };
      return {
        properties: { date: day(now), status: 'planned', ...project },
        body: ['## Aim', '', '## Method', '', '## Results', '', '## Notes', ''].join('\n'),
      };
    },
  };
}

/** Makes a project: a notebook with its hub page and sections. Opens the hub. */
export async function newProject(ctx: Pick<ModuleContext, 'app'>): Promise<void> {
  const name = await ctx.app.askText({ title: 'New project', label: 'Project name' });
  if (name === null) return;
  const notebook = await ctx.app.createFolder('', name);
  if (notebook === null) return;
  for (const section of SECTIONS) await ctx.app.createFolder(notebook, section);
  await ctx.app.createPage(notebook, PROJECT_HUB, 'project');
}
