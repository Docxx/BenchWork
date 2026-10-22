// @vitest-environment node
import { notebookRows } from '../notebooks/notebookTree';
import { MemoryAdapter, type MemoryFolderContents } from '../platform/memory';
import { createAppStore } from './appStore';

const VAULT: MemoryFolderContents = {
  '.benchwork/config.json': '{"version":1}',
  'LPS model/Experiments/Dose.md': 'x',
  'LPS model/Plan.md': 'p',
  'LPS model/_section.yaml': 'colour: teal\n',
  Archive: null,
};

async function openVault(contents = VAULT) {
  const platform = new MemoryAdapter({ folders: { 'C:/Vault': contents } });
  const store = createAppStore(platform);
  platform.queuePick('C:/Vault');
  await store.getState().chooseFolder('open');
  return { platform, store, state: () => store.getState() };
}

function drawn(state: ReturnType<Awaited<ReturnType<typeof openVault>>['state']>): string[] {
  return notebookRows(state.tree, state.settings).map((r) =>
    r.kind === 'node'
      ? `${'  '.repeat(r.depth)}${r.node.title}${r.node.colour ? ` (${r.node.colour})` : ''}`
      : `${'  '.repeat(r.depth)}[${r.kind}]`,
  );
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('notebook actions', () => {
  it('shows notebook colours before a notebook is opened', async () => {
    const { state } = await openVault();
    expect(drawn(state())).toEqual(['Archive', 'LPS model (teal)']);
  });

  it('creates a page, opening its notebook and selecting it', async () => {
    const { state } = await openVault();
    expect(await state().createPage('LPS model')).toBe('LPS model/Untitled page.md');
    expect(state().tree.selected).toBe('LPS model/Untitled page.md');
    expect(drawn(state())).toEqual([
      'Archive',
      'LPS model (teal)',
      '  Experiments',
      '  Plan',
      '  Untitled page',
    ]);
  });

  it('creates notebooks and sections with default names', async () => {
    const { state } = await openVault();
    expect(await state().createNotebook()).toBe('New notebook');
    expect(await state().createSection('New notebook')).toBe('New notebook/New section');
    expect(state().tree.expanded).toContain('New notebook');
  });

  it('keeps open folders and the selection when renaming a notebook', async () => {
    const { state } = await openVault();
    await state().revealFolder('LPS model/Experiments');
    state().selectEntry('LPS model/Experiments/Dose.md');
    expect(await state().renameItem('LPS model', 'LPS study')).toBe('LPS study');
    expect(state().tree.expanded).toEqual(['LPS study', 'LPS study/Experiments']);
    expect(state().tree.selected).toBe('LPS study/Experiments/Dose.md');
    expect(drawn(state())).toEqual([
      'Archive',
      'LPS study (teal)',
      '  Experiments',
      '    Dose',
      '  Plan',
    ]);
  });

  it('moves a page into another notebook', async () => {
    const { platform, state } = await openVault();
    await state().revealFolder('LPS model');
    expect(await state().moveItem('LPS model/Plan.md', 'Archive')).toBe('Archive/Plan.md');
    expect(platform.snapshot()['Archive/Plan.md']).toBe('p');
    expect(state().tree.selected).toBe('Archive/Plan.md');
    expect(drawn(state())).toContain('  Plan');
  });

  it('reorders within a folder and remembers it in _section.yaml', async () => {
    const { platform, state } = await openVault();
    await state().revealFolder('LPS model');
    await state().moveItem('LPS model/Plan.md', 'LPS model', 0);
    expect(drawn(state()).slice(1, 4)).toEqual(['LPS model (teal)', '  Plan', '  Experiments']);
    expect(platform.snapshot()['LPS model/_section.yaml']).toBe(
      'colour: teal\norder:\n  - Plan.md\n  - Experiments\n',
    );
  });

  it('colours a section and shows it at once', async () => {
    const { state } = await openVault();
    await state().revealFolder('LPS model');
    await state().setFolderColour('LPS model/Experiments', 'red');
    expect(drawn(state())).toContain('  Experiments (red)');
  });

  it('sends items to the Recycle Bin, clearing the selection', async () => {
    const { platform, state } = await openVault();
    await state().revealFolder('LPS model/Experiments');
    state().selectEntry('LPS model/Experiments/Dose.md');
    expect(await state().recycleItem('LPS model/Experiments')).toBe(true);
    expect(platform.trashed()).toEqual(['LPS model/Experiments']);
    expect(state().tree.selected).toBeNull();
    expect(state().tree.expanded).toEqual(['LPS model']);
  });

  it('explains a clash instead of overwriting', async () => {
    const { platform, state } = await openVault({ ...VAULT, 'Archive/Plan.md': 'other' });
    await state().revealFolder('LPS model');
    expect(await state().moveItem('LPS model/Plan.md', 'Archive')).toBeNull();
    expect(state().sidebarNotice).toContain('already');
    expect(platform.snapshot()['Archive/Plan.md']).toBe('other');
    state().dismissSidebarNotice();
    expect(state().sidebarNotice).toBeNull();
  });

  it('follows changes made outside BenchWork', async () => {
    const { platform, state } = await openVault();
    await state().revealFolder('LPS model');
    await platform.externalWrite('LPS model/From Explorer.md', 'hello');
    await settle();
    expect(drawn(state())).toContain('  From Explorer');
  });

  it('stops following changes when the vault closes', async () => {
    const { platform, state } = await openVault();
    await state().closeVault();
    await platform.setVaultRoot('C:/Vault');
    await platform.externalWrite('late.md', 'x');
    await settle();
    expect(state().tree.folders).toEqual({});
  });

  it('can show all files', async () => {
    const { state } = await openVault({ ...VAULT, 'photo.png': 'x', attachments: null });
    expect(drawn(state())).not.toContain('photo.png');
    await state().setShowAllFiles(true);
    expect(drawn(state())).toEqual(['Archive', 'attachments', 'LPS model (teal)', 'photo.png']);
  });
});
