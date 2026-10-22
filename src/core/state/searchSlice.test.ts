// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import { createAppStore } from './appStore';
import { locationOf, SEARCH_DELAY_MS } from './searchSlice';

async function openVault() {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork/config.json': '{"version":1}',
        'LPS model/Experiments/Dose.md': 'LPS dose response, climbing at day 7.\n',
        'Daily/2026-10-22.md': 'Flies transferred.\n',
      },
    },
  });
  const store = createAppStore(platform);
  platform.queuePick('C:/Vault');
  await store.getState().chooseFolder('open');
  const state = () => store.getState();
  await state().indexIdle();
  return { platform, state };
}

/** Waits out the typing delay and any indexing. */
const settle = async (state: () => { indexIdle: () => Promise<void> }) => {
  await new Promise((resolve) => setTimeout(resolve, SEARCH_DELAY_MS + 20));
  await state().indexIdle();
  await new Promise((resolve) => setTimeout(resolve, SEARCH_DELAY_MS + 20));
};

describe('search', () => {
  it('finds pages and says where they are', async () => {
    const { state } = await openVault();
    state().setSearchQuery('climb');
    await settle(state);
    expect(state().searchResults).toMatchObject([
      { path: 'LPS model/Experiments/Dose.md', title: 'Dose', location: 'LPS model > Experiments' },
    ]);
    state().clearSearch();
    expect(state().searchResults).toBeNull();
  });

  it('refreshes open results when pages change', async () => {
    const { platform, state } = await openVault();
    state().setSearchQuery('yeast');
    await settle(state);
    expect(state().searchResults).toEqual([]);
    await platform.externalWrite('Daily/2026-10-22.md', 'Ordered yeast.\n');
    await settle(state);
    expect(state().searchResults?.map((r) => r.path)).toEqual(['Daily/2026-10-22.md']);
  });

  it('resets when the vault closes', async () => {
    const { state } = await openVault();
    state().setSearchQuery('flies');
    await settle(state);
    await state().closeVault();
    expect(state().searchQuery).toBe('');
    expect(state().searchResults).toBeNull();
    expect(state().indexProgress.state).toBe('off');
  });

  it('shows folders as a location', () => {
    expect(locationOf('Lab/Experiments/Dose.md')).toBe('Lab > Experiments');
    expect(locationOf('Top.md')).toBe('');
  });
});

describe('tag search', () => {
  it('lists pages with a tag, including nested tags', async () => {
    const platform = new MemoryAdapter({
      folders: {
        'C:/Vault': {
          '.benchwork/config.json': '{"version":1}',
          'Lab/Dose.md': '---\ntags: [LPS]\n---\nDose.\n',
          'Lab/Diet.md': 'Food #lps/high today.\n',
          'Lab/Other.md': 'About lps but no tag.\n',
        },
      },
    });
    const store = createAppStore(platform);
    platform.queuePick('C:/Vault');
    await store.getState().chooseFolder('open');
    const state = () => store.getState();
    await state().indexIdle();
    state().setSearchQuery('#lps');
    await settle(state);
    expect(state().searchResults?.map((r) => r.title)).toEqual(['Diet', 'Dose']);
  });
});
