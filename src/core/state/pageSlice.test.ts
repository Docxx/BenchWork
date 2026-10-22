// @vitest-environment node
import { loadPage } from '../editor/markdown/markdown';
import { setYDocContent, yDocToPage } from '../editor/yjsDoc';
import { MemoryAdapter, type MemoryFolderContents } from '../platform/memory';
import { createAppStore } from './appStore';
import { AUTOSAVE_MS } from './pageSlice';

const PAGE = '---\nid: p1\n---\n# Plan\n\nFirst line.\n\nSecond *para*.\n';

async function openVault(contents: MemoryFolderContents = {}) {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork/config.json': '{"version":1}',
        'Lab/Plan.md': PAGE,
        'Lab/Other.md': 'Other\n',
        'Lab/Plain.md': 'No frontmatter.\n',
        ...contents,
      },
    },
  });
  const store = createAppStore(platform);
  platform.queuePick('C:/Vault');
  await store.getState().chooseFolder('open');
  return { platform, store, state: () => store.getState() };
}

/** Changes the open page as the editor would: through its Yjs document. */
function edit(state: () => { page: { ydoc: import('yjs').Doc } | null }, markdown: string) {
  const page = state().page;
  if (!page) throw new Error('no open page');
  const current = yDocToPage(page.ydoc);
  // New blocks typed in the editor have no remembered Markdown.
  const extra = (loadPage(markdown).doc.content ?? []).map((b) => ({ ...b, attrs: {} }));
  setYDocContent(page.ydoc, { type: 'doc', content: [...(current.content ?? []), ...extra] });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  vi.useRealTimers();
});

describe('opening pages', () => {
  it('opens a page with its title and content', async () => {
    const { state } = await openVault();
    await state().openPage('Lab/Plan.md');
    const page = state().page;
    expect(page?.title).toBe('Plan');
    expect(yDocToPage(page?.ydoc as import('yjs').Doc).content?.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'paragraph',
    ]);
    expect(state().saveState).toBe('saved');
  });

  it('never writes to a page just because it was opened and closed', async () => {
    const { platform, state } = await openVault();
    await state().openPage('Lab/Plan.md');
    await state().closePage();
    expect(platform.snapshot()['Lab/Plan.md']).toBe(PAGE);
  });

  it('explains when a page cannot be opened', async () => {
    const { state } = await openVault();
    await state().openPage('Lab/Missing.md');
    expect(state().page).toBeNull();
    expect(state().pageNotice).toContain('could not be opened');
  });
});

describe('saving', () => {
  it('autosaves a second after the last change, keeping untouched blocks as written', async () => {
    const { platform, state } = await openVault();
    await state().openPage('Lab/Plan.md');
    vi.useFakeTimers();
    edit(state, 'Third __bold__.\n');
    expect(state().saveState).toBe('unsaved');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS - 10);
    expect(platform.snapshot()['Lab/Plan.md']).toBe(PAGE);
    await vi.advanceTimersByTimeAsync(20);
    vi.useRealTimers();
    await state().savePageNow();

    const saved = platform.snapshot()['Lab/Plan.md'] ?? '';
    expect(saved).toMatch(/^---\nid: p1\nmodified: \S+\n---\n/);
    expect(saved).toContain('# Plan\n\nFirst line.\n\nSecond *para*.\n\nThird **bold**.\n');
    expect(state().saveState).toBe('saved');
  });

  it('gives a page an id and created time on its first save', async () => {
    const { platform, state } = await openVault();
    await state().openPage('Lab/Plain.md');
    edit(state, 'More.\n');
    await state().savePageNow();
    expect(platform.snapshot()['Lab/Plain.md']).toMatch(
      /^---\nid: [0-9a-f-]{36}\ncreated: \S+\nmodified: \S+\n---\nNo frontmatter\.\n\nMore\.\n$/,
    );
  });

  it('saves before switching to another page and before the vault closes', async () => {
    const { platform, state } = await openVault();
    await state().openPage('Lab/Plan.md');
    edit(state, 'Edited.\n');
    await state().openPage('Lab/Other.md');
    expect(platform.snapshot()['Lab/Plan.md']).toContain('Edited.');
    edit(state, 'Also.\n');
    await state().closeVault();
    await platform.setVaultRoot('C:/Vault');
    expect(platform.snapshot()['Lab/Other.md']).toContain('Also.');
  });

  it('shows an error and keeps the edits if saving fails', async () => {
    const { platform, state } = await openVault();
    await state().openPage('Lab/Plan.md');
    const write = platform.writeTextAtomic.bind(platform);
    platform.writeTextAtomic = () => Promise.reject(new Error('Disk full'));
    edit(state, 'Edited.\n');
    await state().savePageNow();
    expect(state().saveState).toBe('error');
    expect(state().pageNotice).toContain('Disk full');

    platform.writeTextAtomic = write;
    await state().savePageNow();
    expect(state().saveState).toBe('saved');
    expect(platform.snapshot()['Lab/Plan.md']).toContain('Edited.');
  });
});

describe('changes made outside BenchWork', () => {
  it('reloads the page when there are no unsaved edits', async () => {
    const { platform, state } = await openVault();
    await state().openPage('Lab/Plan.md');
    const before = state().page?.version ?? -1;
    await platform.externalWrite('Lab/Plan.md', '# Plan\n\nChanged in another app.\n');
    await wait(20);
    expect(state().page?.version).toBe(before + 1);
    const doc = yDocToPage(state().page?.ydoc as import('yjs').Doc);
    expect(JSON.stringify(doc)).toContain('Changed in another app.');
    expect(state().pageConflict).toBeNull();
  });

  it('ignores the watcher telling it about its own saves', async () => {
    const { state } = await openVault();
    await state().openPage('Lab/Plan.md');
    edit(state, 'Mine.\n');
    await state().savePageNow();
    const version = state().page?.version;
    await wait(20);
    expect(state().page?.version).toBe(version);
    expect(state().pageConflict).toBeNull();
  });

  it('asks when the page changed while it had unsaved edits', async () => {
    const { platform, state } = await openVault();
    await state().openPage('Lab/Plan.md');
    edit(state, 'Unsaved.\n');
    await platform.externalWrite('Lab/Plan.md', 'Theirs.\n');
    await wait(20);
    expect(state().pageConflict).toEqual({ diskText: 'Theirs.\n' });
    // No autosave over their version while the question is open.
    await state().savePageNow();
    expect(platform.snapshot()['Lab/Plan.md']).toBe('Theirs.\n');
  });

  it('keeping my version saves it and keeps theirs as a snapshot', async () => {
    const { platform, state } = await openVault();
    await state().openPage('Lab/Plan.md');
    edit(state, 'Unsaved.\n');
    await platform.externalWrite('Lab/Plan.md', 'Theirs.\n');
    await wait(20);
    await state().keepMyVersion();
    const files = platform.snapshot();
    expect(files['Lab/Plan.md']).toContain('Unsaved.');
    const snapshots = Object.entries(files).filter(([p]) =>
      p.startsWith('.benchwork/snapshots/p1/'),
    );
    expect(snapshots.map(([, text]) => text)).toEqual(['Theirs.\n']);
  });

  it('loading their version keeps mine as a snapshot', async () => {
    const { platform, state } = await openVault();
    await state().openPage('Lab/Plan.md');
    edit(state, 'Unsaved.\n');
    await platform.externalWrite('Lab/Plan.md', 'Theirs.\n');
    await wait(20);
    await state().loadDiskVersion();
    expect(platform.snapshot()['Lab/Plan.md']).toBe('Theirs.\n');
    const snapshot = Object.entries(platform.snapshot()).find(([p]) =>
      p.startsWith('.benchwork/snapshots/p1/'),
    );
    expect(snapshot?.[1]).toContain('Unsaved.');
    expect(JSON.stringify(yDocToPage(state().page?.ydoc as import('yjs').Doc))).toContain(
      'Theirs.',
    );
  });

  it('closes the page if its file is deleted, unless it has unsaved edits', async () => {
    const { platform, state } = await openVault();
    await state().openPage('Lab/Other.md');
    await platform.trash('Lab/Other.md');
    await wait(600);
    expect(state().page).toBeNull();
    expect(state().pageNotice).toContain('moved or deleted');
  });
});

describe('the sidebar and the open page', () => {
  it('follows a rename of the page or its notebook', async () => {
    const { platform, state } = await openVault();
    await state().revealFolder('Lab');
    await state().openPage('Lab/Plan.md');
    await state().renameItem('Lab/Plan.md', 'October plan');
    expect(state().page?.path).toBe('Lab/October plan.md');
    expect(state().page?.title).toBe('October plan');
    await state().renameItem('Lab', 'LPS');
    expect(state().page?.path).toBe('LPS/October plan.md');

    edit(state, 'After moving.\n');
    await state().savePageNow();
    await wait(600);
    expect(state().page).not.toBeNull();
    expect(platform.snapshot()['LPS/October plan.md']).toContain('After moving.');
  });

  it('opens a new page straight away', async () => {
    const { state } = await openVault();
    const path = await state().createPage('Lab');
    expect(state().page?.path).toBe(path);
  });

  it('saves the open page before it is moved to the Recycle Bin', async () => {
    const { platform, state } = await openVault();
    await state().openPage('Lab/Plan.md');
    edit(state, 'Last words.\n');
    await state().recycleItem('Lab');
    expect(state().page).toBeNull();
    expect(platform.trashed()).toEqual(['Lab']);
  });
});
