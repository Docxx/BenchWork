// @vitest-environment node
import { serialiseInk, type Ink } from '../ink/inkFile';
import { MemoryAdapter, type MemoryFolderContents } from '../platform/memory';
import { createAppStore } from './appStore';

const COPY = 'Lab/Plan.sync-conflict-20261028-113945-ABCDEF7.md';

const ink = (ids: string[]): string => {
  const drawing: Ink = {
    version: 1,
    width: 300,
    height: 200,
    recognisedText: null,
    strokes: ids.map((id) => ({
      id,
      tool: 'pen',
      colour: '#000000',
      width: 2,
      points: [[1, 1, 0.5, 0]],
    })),
  };
  return serialiseInk(drawing);
};

const VAULT: MemoryFolderContents = {
  '.benchwork/config.json': '{"version":1}',
  'Lab/Plan.md': '# Plan\n\nDay 1 on this device.\n',
  [COPY]: '# Plan\n\nDay 1 on the tablet.\n',
  'attachments/Ink a.ink.json': ink(['one', 'two']),
  'attachments/Ink a.ink.sync-conflict-20261028-120000-ABCDEF7.json': ink(['one', 'three']),
};

async function openVault(contents: MemoryFolderContents = VAULT) {
  const platform = new MemoryAdapter({ folders: { 'C:/Vault': contents } });
  const store = createAppStore(platform);
  platform.queuePick('C:/Vault');
  await store.getState().chooseFolder('open');
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { platform, state: () => store.getState(), file: (p: string) => platform.snapshot()[p] };
}

describe('conflict copies from syncing', () => {
  it('are found when the vault opens; drawings merge by themselves', async () => {
    const { state, file, platform } = await openVault();
    expect(state().conflicts.map((c) => c.copy)).toEqual([COPY]);
    expect(file('attachments/Ink a.ink.json')).toMatch(/"one".*\n.*"two".*\n.*"three"/);
    expect(platform.trashed()).toEqual([
      'attachments/Ink a.ink.sync-conflict-20261028-120000-ABCDEF7.json',
    ]);
    // The copy is not a page, so it is not searched.
    expect(state().pageRefs.map((p) => p.path)).not.toContain(COPY);
  });

  it('can be settled by keeping the page as it is', async () => {
    const { state, file, platform } = await openVault();
    expect((await state().readConflict(COPY))?.other).toContain('tablet');
    await state().resolveConflict(COPY, 'current');
    expect(file('Lab/Plan.md')).toContain('this device');
    expect(platform.trashed()).toContain(COPY);
    expect(state().conflicts).toEqual([]);
  });

  it('can be settled by taking the other copy, or keeping both', async () => {
    const taken = await openVault();
    await taken.state().resolveConflict(COPY, 'other');
    expect(taken.file('Lab/Plan.md')).toContain('tablet');

    const both = await openVault();
    await both.state().resolveConflict(COPY, 'both');
    expect(both.file('Lab/Plan.md')).toContain('this device');
    expect(both.file('Lab/Plan (other copy).md')).toContain('tablet');
    expect(both.file(COPY)).toBeUndefined();
  });

  it('keep the index out of syncing, but only in a folder Syncthing syncs', async () => {
    const plain = await openVault({ '.benchwork/config.json': '{"version":1}' });
    expect(plain.file('.stignore')).toBeUndefined();

    const synced = await openVault({
      '.benchwork/config.json': '{"version":1}',
      '.stfolder': null,
      '.stignore': '*.tmp\n',
    });
    expect(synced.file('.stignore')).toMatch(
      /^\*\.tmp\n\n\/\/ BenchWork.*\n\.benchwork\/index\.sqlite\*/,
    );
  });
});
