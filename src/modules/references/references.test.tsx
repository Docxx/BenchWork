import { act, fireEvent, render, screen } from '@testing-library/react';
import { createContributions } from '@core/modules/contributions';
import { validateManifest } from '@core/modules/manifest';
import { ModuleRegistry, type ModuleSource } from '@core/modules/registry';
import { parsePage } from '@core/pages/frontmatter';
import { MemoryAdapter, type MemoryFolderContents } from '@core/platform/memory';
import { createAppStore } from '@core/state/appStore';
import { AppStoreProvider } from '@core/ui/AppStoreContext';
import { ModulesPanel } from '@core/ui/ModulesPanel';
import manifestJson from './manifest.json';
import { fullReference, parseLibrary, searchLibrary, shortLabel } from './library';

// Tests may reach core internals to set the app up; the module itself may not.

const LIBRARY = JSON.stringify([
  {
    id: 'smith2024',
    type: 'article-journal',
    title: 'Tau spreads in the fly brain',
    author: [
      { family: 'Smith', given: 'Alice Jane' },
      { family: 'Lee', given: 'Bo' },
      { family: 'Okafor', given: 'Chi' },
    ],
    issued: { 'date-parts': [[2024, 3]] },
    'container-title': 'Neuron',
    DOI: '10.1016/j.neuron.2024.01.001',
  },
  {
    id: 'lee2023',
    title: 'Climbing assays revisited',
    author: [
      { family: 'Lee', given: 'Bo' },
      { family: 'Smith', given: 'Alice' },
    ],
    issued: { 'date-parts': [[2023]] },
  },
  { id: 'who2020', title: 'Guidance', author: [{ literal: 'WHO' }], issued: { raw: 'May 2020' } },
  { id: 'bad key', title: 'Skipped: keys have no spaces' },
]);

describe('the library file', () => {
  const { refs, error } = parseLibrary(LIBRARY);

  it('reads Better CSL JSON, keyed by citation key', () => {
    expect(error).toBeNull();
    expect([...refs.keys()]).toEqual(['smith2024', 'lee2023', 'who2020']);
    expect(refs.get('who2020')).toMatchObject({
      authors: [{ family: 'WHO', given: '' }],
      year: '2020',
    });
  });

  it('says when it cannot be read', () => {
    expect(parseLibrary('not json').error).toContain('not valid JSON');
    expect(parseLibrary('{"a": 1}').error).toContain('not a CSL JSON list');
    expect(parseLibrary('{"items": []}').error).toBeNull();
  });

  it('names works briefly, and in full', () => {
    const get = (k: string) => {
      const r = refs.get(k);
      if (!r) throw new Error(k);
      return r;
    };
    expect(shortLabel(get('smith2024'))).toBe('Smith et al. 2024');
    expect(shortLabel(get('lee2023'))).toBe('Lee and Smith 2023');
    expect(shortLabel(get('who2020'))).toBe('WHO 2020');
    expect(fullReference(get('smith2024'))).toBe(
      'Smith, A. J., Lee, B., Okafor, C. (2024). Tau spreads in the fly brain. Neuron. doi:10.1016/j.neuron.2024.01.001',
    );
  });

  it('finds works by key, surname, year or title, best first', () => {
    const keys = (q: string) => searchLibrary(refs, q).map((c) => c.key);
    expect(keys('smi')).toEqual(['smith2024', 'lee2023']);
    expect(keys('lee 2023')).toEqual(['lee2023']);
    expect(keys('tau')).toEqual(['smith2024']);
    expect(keys('nothing')).toEqual([]);
    expect(searchLibrary(refs, '')).toHaveLength(3);
    expect(searchLibrary(refs, 'smith')[0]).toEqual({
      key: 'smith2024',
      label: 'Smith et al. 2024',
      detail: 'Tau spreads in the fly brain',
    });
  });
});

function source(): ModuleSource {
  const result = validateManifest(manifestJson, 'references');
  if (!result.ok) throw new Error(result.errors.join(', '));
  return { manifest: result.manifest, load: async () => (await import('./index')).default };
}

async function openVault(files: MemoryFolderContents = {}, enabled = true) {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork/config.json': JSON.stringify({
          version: 1,
          modules: { references: { enabled } },
        }),
        ...files,
      },
    },
  });
  const registry = new ModuleRegistry([source()], [], {
    platform,
    device: 'desktop',
    contributions: createContributions(),
  });
  const store = createAppStore(platform, registry);
  platform.queuePick('C:/Vault');
  await act(async () => {
    await store.getState().chooseFolder('open');
  });
  const state = () => store.getState();
  const provider = () => {
    const p = state().citationProvider();
    if (!p) throw new Error('no citation provider');
    return p;
  };
  return { platform, store, state, provider };
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });

describe('References module', () => {
  it('names cited works from the library in the vault', async () => {
    const { provider } = await openVault({ 'references/library.json': LIBRARY });
    expect(provider().describe('smith2024')).toEqual({
      short: 'Smith et al. 2024',
      full: expect.stringContaining('Tau spreads') as string,
    });
    expect(provider().describe('missing')).toBeNull();
    expect(
      provider()
        .suggest('lee')
        .map((c) => c.key),
    ).toEqual(['lee2023', 'smith2024']);
  });

  it('follows changes to the library, as when Better BibTeX updates it', async () => {
    const { platform, state, provider } = await openVault({ 'references/library.json': '[]' });
    const before = state().citationVersion;
    await platform.externalWrite('references/library.json', LIBRARY);
    await vi.waitFor(() => {
      expect(provider().describe('lee2023')?.short).toBe('Lee and Smith 2023');
    });
    expect(state().citationVersion).toBeGreaterThan(before);
  });

  it('opens a literature note, making it from the reference the first time', async () => {
    const { platform, state, provider } = await openVault({ 'references/library.json': LIBRARY });
    await act(async () => {
      await provider().open('smith2024');
    });
    expect(state().page?.path).toBe('references/smith2024.md');
    const note = parsePage(platform.snapshot()['references/smith2024.md'] ?? '');
    expect(note.meta.type).toBe('reference');
    expect(state().pageProperties).toMatchObject({
      citekey: 'smith2024',
      authors: ['Smith, Alice Jane', 'Lee, Bo', 'Okafor, Chi'],
      year: '2024',
      journal: 'Neuron',
      doi: '10.1016/j.neuron.2024.01.001',
    });
    expect(note.body).toContain('# Tau spreads in the fly brain');

    // Next time it opens the same page, wherever it has been moved to.
    await state().closePage();
    await state().indexIdle();
    await act(async () => {
      await provider().open('smith2024');
    });
    expect(state().page?.path).toBe('references/smith2024.md');
  });

  it('makes no note for a key the library does not have', async () => {
    const { platform, state, provider } = await openVault({ 'references/library.json': LIBRARY });
    await act(async () => {
      await provider().open('nobody1999');
    });
    expect(state().sidebarNotice).toContain('@nobody1999 is not in the reference library');
    expect(Object.keys(platform.snapshot()).some((p) => p.includes('nobody'))).toBe(false);
  });

  it('shows the library in Settings, and says when there is no file yet', async () => {
    const { store } = await openVault();
    render(
      <AppStoreProvider store={store}>
        <ModulesPanel />
      </AppStoreProvider>,
    );
    await settle();
    expect(screen.getByText('references/library.json')).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe('No file there yet.');
    expect(screen.getByRole('button', { name: 'Choose library file' })).toBeDefined();
  });

  it('can read a library chosen elsewhere in the vault, and remembers it', async () => {
    const { platform, store, provider } = await openVault({ 'Zotero/My library.json': LIBRARY });
    render(
      <AppStoreProvider store={store}>
        <ModulesPanel />
      </AppStoreProvider>,
    );
    await settle();
    expect(provider().describe('smith2024')).toBeNull();

    platform.queueFilePick(['C:/Vault/Zotero/My library.json']);
    fireEvent.click(screen.getByRole('button', { name: 'Choose library file' }));
    await vi.waitFor(() => {
      expect(provider().describe('smith2024')).not.toBeNull();
    });
    expect(screen.getByRole('status').textContent).toMatch(/^3 references, last changed /);
    expect(platform.snapshot()['.benchwork/modules/references/settings.json']).toContain(
      'Zotero/My library.json',
    );
  });

  it('refuses a library file outside the vault', async () => {
    const { platform, store, state } = await openVault();
    render(
      <AppStoreProvider store={store}>
        <ModulesPanel />
      </AppStoreProvider>,
    );
    await settle();
    platform.queueFilePick(['D:/Elsewhere/library.json']);
    fireEvent.click(screen.getByRole('button', { name: 'Choose library file' }));
    await vi.waitFor(() => {
      expect(state().sidebarNotice).toContain('Choose a file inside the vault');
    });
  });

  it('when switched off, leaves citations and notes as they are', async () => {
    const { platform, state } = await openVault({
      'references/library.json': LIBRARY,
      'references/smith2024.md': '---\ntype: reference\ncitekey: smith2024\n---\nNotes.\n',
      'Daily/2026-10-23.md': 'Read [@smith2024].\n',
    });
    const before = platform.snapshot();
    await act(async () => {
      await state().setModuleEnabled('references', false);
    });
    expect(state().citationProvider()).toBeNull();
    const after = platform.snapshot();
    for (const path of Object.keys(before).filter((p) => !p.startsWith('.benchwork'))) {
      expect(after[path]).toBe(before[path]);
    }
  });
});
