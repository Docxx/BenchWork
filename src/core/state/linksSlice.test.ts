// @vitest-environment node
import { MemoryAdapter, type MemoryFolderContents } from '../platform/memory';
import { createAppStore } from './appStore';
import { LINKS_REFRESH_MS, plainLine } from './linksSlice';

const VAULT: MemoryFolderContents = {
  '.benchwork/config.json': '{"version":1}',
  'Lab/Plan.md': '# Plan\n\nOrder food.\n',
  'Home/Plan.md': 'Groceries.\n',
  'Lab/Experiments/Dose.md': 'See the [[Plan|lab plan]] for dates.\n\nAlso [[Lab/Plan]].\n',
  'Lab/Notes.md': '- Check [[Plan]] first\n- Then `[[Plan]]` in code\n',
  'Home/List.md': 'Shopping: [[Plan]]\n',
};

async function openVault(contents: MemoryFolderContents = VAULT) {
  const platform = new MemoryAdapter({ folders: { 'C:/Vault': contents } });
  const store = createAppStore(platform);
  platform.queuePick('C:/Vault');
  await store.getState().chooseFolder('open');
  const state = () => store.getState();
  /** Waits for indexing, then for the page list and backlinks to reload. */
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    await state().indexIdle();
    await new Promise((resolve) => setTimeout(resolve, LINKS_REFRESH_MS + 50));
  };
  await settle();
  return { platform, state, settle, file: (p: string) => platform.snapshot()[p] };
}

describe('backlinks', () => {
  it('lists pages linking to the open page, with the line, and not links meaning another page', async () => {
    const { state, settle } = await openVault();
    await state().openPage('Lab/Plan.md');
    await settle();
    expect(state().backlinks).toEqual([
      {
        path: 'Lab/Experiments/Dose.md',
        title: 'Dose',
        location: 'Lab > Experiments',
        context: 'See the lab plan for dates.',
      },
      { path: 'Lab/Notes.md', title: 'Notes', location: 'Lab', context: 'Check Plan first' },
    ]);

    await state().openPage('Home/Plan.md');
    await settle();
    expect(state().backlinks.map((b) => b.path)).toEqual(['Home/List.md']);
  });

  it('shows a line of Markdown as plain text', () => {
    expect(plainLine('- [ ] Ask **Sam** about [[Plan|the plan]]')).toBe('Ask Sam about the plan');
    expect(plainLine('## See [[Dose]]')).toBe('See Dose');
  });
});

describe('following links', () => {
  it('opens the page a link means, from where the link is', async () => {
    const { state } = await openVault();
    await state().openPage('Home/List.md');
    expect(state().linkResolves('Plan')).toBe(true);
    await state().followLink('Plan');
    expect(state().page?.path).toBe('Home/Plan.md');
  });

  it('asks the editor to go to the heading a link names', async () => {
    const { state } = await openVault();
    await state().openPage('Home/List.md');
    await state().followLink('Lab/Plan#Plan');
    expect(state().page?.path).toBe('Lab/Plan.md');
    expect(state().revealHeading).toBe('Plan');

    await state().followLink('Home/Plan');
    expect(state().revealHeading).toBeNull();
  });

  it('creates a page that does not exist yet beside the current one', async () => {
    const { state, file } = await openVault();
    await state().openPage('Lab/Notes.md');
    expect(state().linkResolves('Western blot')).toBe(false);
    await state().followLink('Western blot#Methods');
    expect(state().page?.path).toBe('Lab/Western blot.md');
    expect(file('Lab/Western blot.md')).toMatch(/^---\nid: /);
  });

  it('writes the shortest name that means one page', async () => {
    const { state } = await openVault();
    expect(state().linkTargetFor('Lab/Experiments/Dose.md')).toBe('Dose');
    expect(state().linkTargetFor('Lab/Plan.md')).toBe('Lab/Plan');
  });
});

describe('renaming and moving', () => {
  it('updates links to a renamed page and leaves everything else alone', async () => {
    const { state, file, settle } = await openVault();
    const path = await state().renameItem('Lab/Plan.md', 'October plan');
    expect(path).toBe('Lab/October plan.md');
    expect(file('Lab/Experiments/Dose.md')).toBe(
      'See the [[October plan|lab plan]] for dates.\n\nAlso [[October plan]].\n',
    );
    expect(file('Lab/Notes.md')).toBe(
      '- Check [[October plan]] first\n- Then `[[Plan]]` in code\n',
    );
    expect(file('Home/List.md')).toBe(VAULT['Home/List.md']);
    expect(state().sidebarNotice).toBe('Updated links in 2 pages.');

    await settle();
    await state().openPage('Lab/October plan.md');
    await settle();
    expect(state().backlinks.map((b) => b.path)).toEqual([
      'Lab/Experiments/Dose.md',
      'Lab/Notes.md',
    ]);
  });

  it('keeps short links short when a page only moves', async () => {
    const { state, file } = await openVault({
      '.benchwork/config.json': '{"version":1}',
      'Lab/Dose.md': 'Dose\n',
      'Archive/Old': null,
      'Lab/Notes.md': 'See [[Dose]] and [[Lab/Dose]].\n',
    });
    await state().moveItem('Lab/Dose.md', 'Archive/Old');
    expect(file('Lab/Notes.md')).toBe('See [[Dose]] and [[Dose]].\n');
    expect(state().sidebarNotice).toBe('Updated links in 1 page.');
  });

  it('updates links into a renamed folder', async () => {
    const { state, file } = await openVault();
    await state().renameItem('Lab', 'Lab 2026');
    expect(file('Lab 2026/Experiments/Dose.md')).toBe(
      'See the [[Plan|lab plan]] for dates.\n\nAlso [[Lab 2026/Plan]].\n',
    );
    expect(file('Home/List.md')).toBe(VAULT['Home/List.md']);
  });

  it('updates links even straight after the vault opens, before the page list loads', async () => {
    const platform = new MemoryAdapter({ folders: { 'C:/Vault': VAULT } });
    const store = createAppStore(platform);
    platform.queuePick('C:/Vault');
    await store.getState().chooseFolder('open');
    // No waiting for indexing or the page list.
    await store.getState().renameItem('Home/Plan.md', 'Shopping plan');
    expect(platform.snapshot()['Home/List.md']).toBe('Shopping: [[Shopping plan]]\n');
  });

  it('saves the open page first, so its edits are kept', async () => {
    const { state, file, platform } = await openVault();
    await state().openPage('Home/List.md');
    await platform.externalWrite('Home/List.md', 'Shopping: [[Plan]] and more\n');
    await state().renameItem('Home/Plan.md', 'Shopping plan');
    expect(file('Home/List.md')).toBe('Shopping: [[Shopping plan]] and more\n');
  });
});
