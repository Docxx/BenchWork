// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import { parseAppSettings } from '../settings/appSettings';
import { createAppStore } from './appStore';
import { moveCard, orderCards, recentPages } from './homeSlice';

async function openVault() {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Lab vault': {
        '.benchwork/config.json': '{"version":1}',
        'Lab/Plan.md': '# Plan\n',
        'Lab/Notes.md': '# Notes\n',
      },
    },
  });
  const store = createAppStore(platform);
  platform.queuePick('C:/Lab vault');
  await store.getState().chooseFolder('open');
  return { platform, store, state: () => store.getState() };
}

describe('Home cards', () => {
  it('follow the saved order, with new cards after in their usual order', () => {
    const layout = { order: ['b', 'gone', 'a'], hidden: [], pinned: [] };
    expect(orderCards(['a', 'b', 'c'], layout)).toEqual(['b', 'a', 'c']);
  });

  it('move one place at a time, and not past the ends', () => {
    expect(moveCard(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
    expect(moveCard(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveCard(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
  });

  it('list recent pages newest first, leaving out records', () => {
    const ref = (path: string, mtime: number | null) => ({
      path,
      title: path,
      id: null,
      type: 'page',
      mtime,
    });
    const pages = [
      ref('a.md', 1),
      ref('b.md', 3),
      ref('c.dataset.yaml', 9),
      ref('d.md', null),
      ref('e.md', 2),
    ];
    expect(recentPages(pages, 2).map((p) => p.path)).toEqual(['b.md', 'e.md']);
  });

  it('are read back from settings, keeping only lists of names', () => {
    const settings = parseAppSettings({
      home: { 'C:/Lab vault': { order: ['home.recent', 3], hidden: 'x', pinned: ['a.md'] } },
    });
    expect(settings.home['C:/Lab vault']).toEqual({
      order: ['home.recent'],
      hidden: [],
      pinned: ['a.md'],
    });
  });
});

describe('Home', () => {
  it('shows when nothing is open, and going home closes the page', async () => {
    const { state } = await openVault();
    expect(state().atHome()).toBe(true);
    await state().openPage('Lab/Plan.md');
    expect(state().atHome()).toBe(false);
    await state().goHome();
    expect(state().page).toBeNull();
    expect(state().atHome()).toBe(true);
  });

  it('keeps pinned pages per vault, and follows them when renamed', async () => {
    const { platform, state } = await openVault();
    await state().setPinned('Lab/Plan.md', true);
    await state().setPinned('Lab/Notes.md', true);
    await state().setPinned('Lab/Notes.md', false);
    expect(state().homeLayout().pinned).toEqual(['Lab/Plan.md']);

    expect(await state().renameItem('Lab', 'Bench')).toBe('Bench');
    expect(state().homeLayout().pinned).toEqual(['Bench/Plan.md']);
    const saved = parseAppSettings(await platform.loadAppSettings());
    expect(saved.home['C:/Lab vault']?.pinned).toEqual(['Bench/Plan.md']);
  });

  it('lists recent pages from the index', async () => {
    const { state } = await openVault();
    const pages = await state().recentPages(5);
    expect(pages.map((p) => p.path).sort()).toEqual(['Lab/Notes.md', 'Lab/Plan.md']);
  });
});
