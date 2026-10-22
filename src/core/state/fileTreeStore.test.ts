// @vitest-environment node
import { MemoryAdapter, type MemoryFolderContents } from '../platform/memory';
import { treeRows } from '../vault/fileTree';
import { createAppStore } from './appStore';

const VAULT: MemoryFolderContents = {
  '.benchwork/config.json': '{"version":1}',
  'Day 10.md': '',
  'Day 2.md': '',
  'LPS model/Experiments/2026-10-21 LPS dose.md': 'x',
  'LPS model/Data/run1.csv': 'a,b',
  'LPS model/notes.md': '',
  Empty: null,
};

async function openVault(contents: MemoryFolderContents = VAULT) {
  const platform = new MemoryAdapter({ folders: { 'C:/Vault': contents } });
  const store = createAppStore(platform);
  platform.queuePick('C:/Vault');
  await store.getState().chooseFolder('open');
  return { platform, store, state: () => store.getState() };
}

/** The tree as indented text, for readable expectations. */
function drawn(state: ReturnType<ReturnType<typeof createAppStore>['getState']>): string[] {
  return treeRows(state.tree).map((r) =>
    r.kind === 'entry'
      ? `${'  '.repeat(r.depth)}${r.entry.name}`
      : `${'  '.repeat(r.depth)}[${r.kind}]`,
  );
}

describe('file tree state', () => {
  it('loads the root when a vault opens, hiding .benchwork', async () => {
    const { state } = await openVault();
    expect(drawn(state())).toEqual(['Empty', 'LPS model', 'Day 2.md', 'Day 10.md']);
  });

  it('loads a folder only when it is first opened', async () => {
    const { platform, state } = await openVault();
    const listDir = vi.spyOn(platform, 'listDir');

    await state().toggleFolder('LPS model');
    expect(drawn(state())).toEqual([
      'Empty',
      'LPS model',
      '  Data',
      '  Experiments',
      '  notes.md',
      'Day 2.md',
      'Day 10.md',
    ]);
    expect(listDir).toHaveBeenCalledTimes(1);

    await state().toggleFolder('LPS model');
    await state().toggleFolder('LPS model');
    expect(listDir).toHaveBeenCalledTimes(1);
  });

  it('collapses an open folder', async () => {
    const { state } = await openVault();
    await state().toggleFolder('LPS model');
    await state().toggleFolder('LPS model');
    expect(drawn(state())).toEqual(['Empty', 'LPS model', 'Day 2.md', 'Day 10.md']);
  });

  it('shows empty folders', async () => {
    const { state } = await openVault();
    await state().toggleFolder('Empty');
    expect(drawn(state())).toContain('  [empty]');
  });

  it('refresh picks up new files and drops folders that have gone', async () => {
    const { platform, state } = await openVault();
    await state().toggleFolder('LPS model');
    await state().toggleFolder('LPS model/Data');
    state().selectEntry('LPS model/Data/run1.csv');

    // Something outside BenchWork changes the folder.
    platform.addFolder('C:/Vault', {
      '.benchwork/config.json': '{"version":1}',
      'Day 2.md': '',
      'New page.md': '',
      'LPS model/notes.md': '',
    });
    await state().refreshTree();

    expect(drawn(state())).toEqual(['LPS model', '  notes.md', 'Day 2.md', 'New page.md']);
    expect(state().tree.expanded).toEqual(['LPS model']);
    expect(state().tree.selected).toBeNull();
  });

  it('keeps the selection when it still exists after refresh', async () => {
    const { state } = await openVault();
    state().selectEntry('Day 2.md');
    await state().refreshTree();
    expect(state().tree.selected).toBe('Day 2.md');
  });

  it('starts fresh when switching vault', async () => {
    const { state } = await openVault();
    await state().toggleFolder('LPS model');
    state().closeVault();
    expect(state().tree.expanded).toEqual([]);
    expect(state().tree.folders).toEqual({});
  });

  it('ignores a listing that finishes after the vault was closed', async () => {
    const { platform, state } = await openVault();
    let release: () => void = () => undefined;
    const original = platform.listDir.bind(platform);
    platform.listDir = async (path) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return original(path);
    };

    const pending = state().toggleFolder('LPS model');
    state().closeVault();
    release();
    await pending;
    expect(state().tree.folders).toEqual({});
  });

  it('shows an error row if the root cannot be listed', async () => {
    const platform = new MemoryAdapter({ folders: { 'C:/Vault': { '.benchwork': null } } });
    const store = createAppStore(platform);
    // An existing vault is recognised without listing it, so every listing here is the tree's.
    platform.listDir = () => Promise.reject(new Error('Access denied'));
    platform.queuePick('C:/Vault');
    await store.getState().chooseFolder('open');
    const [row] = treeRows(store.getState().tree);
    expect(row).toMatchObject({ kind: 'error' });
    expect(row?.kind === 'error' && row.message).toContain('Access denied');
  });
});
