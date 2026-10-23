// @vitest-environment node
import type { ModuleContext } from '../api';
import { createContributions } from '../modules/contributions';
import { ModuleRegistry } from '../modules/registry';
import { fakeModule } from '../modules/testModules';
import { parsePage } from '../pages/frontmatter';
import { MemoryAdapter, type MemoryFolderContents } from '../platform/memory';
import { createAppStore } from './appStore';

const VAULT: MemoryFolderContents = {
  '.benchwork/config.json': '{"version":1,"modules":{"lab":{"enabled":true}}}',
  'LPS model/Experiments/Dose.md': '---\nid: d1\ndatasets: ["[[day7]]"]\n---\nDose notes\n',
  'LPS model/Data/day7.dataset.yaml': 'experiment: "[[Dose]]"\n',
  'LPS model/Data/day7.csv': 'x,y\n',
};

/** Opens a vault with a `lab` module on that registers a page type and two commands. */
async function openVault() {
  const platform = new MemoryAdapter({ folders: { 'C:/Vault': VAULT } });
  const started: { ctx: ModuleContext | null } = { ctx: null };
  const lab = fakeModule('lab', [], {
    activate: (ctx) => {
      started.ctx = ctx;
      ctx.pageTypes.register({
        type: 'experiment',
        name: 'Experiment',
        fields: [{ key: 'status', label: 'Status', kind: 'choice', options: ['planned', 'done'] }],
        create: ({ title }) => ({
          properties: { status: 'planned', id: 'not this one' },
          body: `## Aim\n\nWhat ${title} is for.\n`,
        }),
      });
      ctx.commands.register({
        id: 'lab.broken',
        title: 'Broken',
        run: () => {
          throw new Error('Nope');
        },
      });
    },
  });
  const registry = new ModuleRegistry([lab], [], {
    platform,
    device: 'desktop',
    contributions: createContributions(),
  });
  const store = createAppStore(platform, registry);
  platform.queuePick('C:/Vault');
  await store.getState().chooseFolder('open');
  await store.getState().indexIdle();
  const { ctx } = started;
  if (ctx === null) throw new Error('The lab module did not start');
  return { platform, store, state: () => store.getState(), ctx };
}

describe('module page types and commands in the app', () => {
  it('lists what modules registered', async () => {
    const { state } = await openVault();
    expect(state().pageTypes.map((t) => t.type)).toEqual(['experiment']);
    expect(state().commands.map((c) => c.id)).toEqual(['lab.broken']);
  });

  it('creates a page of a module type with its starting properties and body', async () => {
    const { platform, state } = await openVault();
    const path = await state().createTypedPage('LPS model/Experiments', 'experiment');
    expect(path).toBe('LPS model/Experiments/Untitled experiment.md');
    const page = parsePage(platform.snapshot()[path ?? ''] ?? '');
    expect(page.meta.type).toBe('experiment');
    expect(page.meta.id).not.toBe('not this one');
    expect(page.yaml?.split('\n').map((l) => l.split(':')[0])).toEqual([
      'id',
      'type',
      'created',
      'status',
    ]);
    expect(page.body).toBe('## Aim\n\nWhat Untitled experiment is for.\n');
    expect(state().page?.path).toBe(path);
  });

  it('says so when a page type is not available', async () => {
    const { state } = await openVault();
    expect(await state().createTypedPage('LPS model', 'stock')).toBeNull();
    expect(state().sidebarNotice).toContain('not available');
  });

  it('turns a failing command into a notice', async () => {
    const { state } = await openVault();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await state().runCommand('lab.broken', { folder: null });
    expect(state().sidebarNotice).toContain('Broken could not be done');
  });

  it('asks for text and hands back the answer', async () => {
    const { state, ctx } = await openVault();
    const asked = ctx.app.askText({ title: 'New project', label: 'Name' });
    expect(state().textPrompt).toEqual({ title: 'New project', label: 'Name', initial: '' });
    state().answerText('  LPS model 2 ');
    expect(await asked).toBe('LPS model 2');
    expect(state().textPrompt).toBeNull();

    const cancelled = ctx.app.askText({ title: 'New project', label: 'Name' });
    state().answerText(null);
    expect(await cancelled).toBeNull();
  });
});

describe('the app as modules see it', () => {
  it('lists items with their types and follows links both ways', async () => {
    const { ctx } = await openVault();
    expect(await ctx.app.items()).toEqual([
      { path: 'LPS model/Data/day7.dataset.yaml', title: 'day7', type: 'dataset' },
      { path: 'LPS model/Experiments/Dose.md', title: 'Dose', type: 'page' },
    ]);
    expect(await ctx.app.linksTo('LPS model/Data/day7.dataset.yaml')).toEqual([
      { path: 'LPS model/Experiments/Dose.md', title: 'Dose', type: 'page' },
    ]);
    expect(await ctx.app.linkTarget('LPS model/Data/day7.dataset.yaml')).toBe('day7');
    expect(await ctx.app.resolveLink('Dose', 'LPS model/Data/day7.dataset.yaml')).toBe(
      'LPS model/Experiments/Dose.md',
    );
    expect(ctx.vault.vaultPathOf('C:/Vault/LPS model/Data/day7.csv')).toBe(
      'LPS model/Data/day7.csv',
    );
    expect(ctx.vault.vaultPathOf('D:/Raw/scan.tif')).toBeNull();
  });

  it('opens pages in the editor and other files in their viewer', async () => {
    const { state, ctx } = await openVault();
    await ctx.app.open('LPS model/Data/day7.csv');
    expect(state().openFile).toBe('LPS model/Data/day7.csv');
    expect(state().page).toBeNull();
    await ctx.app.open('LPS model/Experiments/Dose.md');
    expect(state().openFile).toBeNull();
    expect(state().page?.path).toBe('LPS model/Experiments/Dose.md');
  });

  it('keeps the open file when it is renamed', async () => {
    const { state } = await openVault();
    await state().openPath('LPS model/Data/day7.dataset.yaml');
    const renamed = await state().renameItem('LPS model/Data/day7.dataset.yaml', 'climbing-day7');
    expect(renamed).toBe('LPS model/Data/climbing-day7.dataset.yaml');
    expect(state().openFile).toBe(renamed);
  });
});
