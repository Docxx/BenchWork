import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createContributions } from '@core/modules/contributions';
import { validateManifest } from '@core/modules/manifest';
import { ModuleRegistry, type ModuleSource } from '@core/modules/registry';
import { parsePage } from '@core/pages/frontmatter';
import { MemoryAdapter, type MemoryFolderContents } from '@core/platform/memory';
import { createAppStore } from '@core/state/appStore';
import { AppStoreProvider } from '@core/ui/AppStoreContext';
import { ModulePanels } from '@core/ui/ModulePanels';
import { ModulesPanel } from '@core/ui/ModulesPanel';
import manifestJson from './manifest.json';
import {
  findReferences,
  fullReference,
  NO_FILTER,
  parseLibrary,
  searchLibrary,
  shortLabel,
  UNFILED,
  type LibraryFilter,
  type LibrarySort,
} from './library';

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

  it('finds subjects in CSL keywords and Zotero tag objects', () => {
    const library = parseLibrary(
      JSON.stringify([
        { id: 'article', keyword: 'Cell repair; Imaging', tags: [{ tag: 'Microscopy' }] },
      ]),
    );
    expect(library.refs.get('article')?.subjects).toEqual(['Cell repair', 'Imaging', 'Microscopy']);
    expect(searchLibrary(library.refs, 'micro repair').map((r) => r.key)).toEqual(['article']);
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
    expect(keys('Alice Neuron')).toEqual(['smith2024']);
    expect(keys('10.1016/j.neuron.2024.01.001')).toEqual(['smith2024']);
    expect(keys('@lee2023')).toEqual(['lee2023']);
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

const ZOTERO_COPY = JSON.stringify({
  source: 'zotero',
  userId: '42',
  version: 3,
  synced: '2026-11-27T10:00:00.000Z',
  collections: [
    { key: 'TH', name: 'Thesis', parent: null },
    { key: 'C2', name: 'Chapter 2', parent: 'TH' },
    { key: 'ME', name: 'Methods', parent: null },
  ],
  items: [
    {
      id: 'Buchon2014-rs',
      title: 'Immunity in Drosophila',
      author: [{ family: 'Buchon', given: 'Nicolas' }],
      issued: { 'date-parts': [[2014]] },
      'container-title': 'Nature Reviews Immunology',
      abstract: 'Antimicrobial peptides protect the fly.',
      'zotero-collections': ['C2'],
      'zotero-tags': ['review'],
      'zotero-added': '2025-03-01T00:00:00Z',
    },
    {
      id: 'Kounatidis2017-ab',
      title: 'NF-kB immunity in the brain determines fly lifespan',
      author: [{ family: 'Kounatidis', given: 'Ilias' }],
      issued: { 'date-parts': [[2017]] },
      'container-title': 'Cell Reports',
      'zotero-collections': ['TH'],
      'zotero-added': '2026-01-01T00:00:00Z',
    },
    {
      id: 'Abel2020-cd',
      title: 'Peptide methods for flies',
      author: [{ family: 'Abel', given: 'Ann' }],
      issued: { 'date-parts': [[2020]] },
      'zotero-collections': ['ME'],
      'zotero-added': '2024-01-01T00:00:00Z',
    },
    {
      id: 'Loose2010-ef',
      title: 'Unfiled thing',
      issued: { 'date-parts': [[2010]] },
      'container-title': 'Neuron',
    },
  ],
});

describe('finding references on the library page', () => {
  const { refs, collections } = parseLibrary(ZOTERO_COPY);
  const find = (
    filter: Partial<LibraryFilter>,
    sort: LibrarySort = 'relevance',
    descending = false,
  ) =>
    findReferences(refs, collections, { ...NO_FILTER, ...filter }, sort, descending).map(
      (r) => r.key,
    );

  it('filters by collection, sub-collections included, unfiled, tag, years and journal', () => {
    expect(find({ collection: 'TH' }).sort()).toEqual(['Buchon2014-rs', 'Kounatidis2017-ab']);
    expect(find({ collection: 'C2' })).toEqual(['Buchon2014-rs']);
    expect(find({ collection: UNFILED })).toEqual(['Loose2010-ef']);
    expect(find({ tag: 'review' })).toEqual(['Buchon2014-rs']);
    expect(find({ yearFrom: '2015', yearTo: '2020' }).sort()).toEqual([
      'Abel2020-cd',
      'Kounatidis2017-ab',
    ]);
    expect(find({ journal: 'nature rev' })).toEqual(['Buchon2014-rs']);
  });

  it('finds words in the abstract and journal, ranking titles and authors above them', () => {
    expect(find({ text: 'antimicrobial' })).toEqual(['Buchon2014-rs']);
    expect(find({ text: 'cell reports' })).toEqual(['Kounatidis2017-ab']);
    // "peptide" is in Abel's title but only in Buchon's abstract.
    expect(find({ text: 'peptide' })).toEqual(['Abel2020-cd', 'Buchon2014-rs']);
    // The whole phrase in a title counts extra.
    expect(find({ text: 'fly lifespan' })[0]).toBe('Kounatidis2017-ab');
  });

  it('sorts by any column either way, newest added first by default, blanks last', () => {
    expect(find({}, 'added', true)).toEqual([
      'Kounatidis2017-ab',
      'Buchon2014-rs',
      'Abel2020-cd',
      'Loose2010-ef',
    ]);
    expect(find({}, 'author')).toEqual([
      'Abel2020-cd',
      'Buchon2014-rs',
      'Kounatidis2017-ab',
      'Loose2010-ef',
    ]);
    expect(find({}, 'year', true)[0]).toBe('Abel2020-cd');
    expect(find({}, 'journal').at(-1)).toBe('Abel2020-cd');
    expect(find({}, 'journal', true).at(-1)).toBe('Abel2020-cd');
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
  it('lists beyond the sidebar limit and offers the chosen reference’s PDF attachment', async () => {
    const books = Array.from({ length: 105 }, (_, i) => ({
      id: 'paper' + String(i),
      title: 'Paper ' + String(i),
      keyword: i === 104 ? 'Cell repair' : 'Imaging',
      URL: 'https://example.org/article',
      attachments: [{ contentType: 'application/pdf', url: 'https://example.org/fulltext' }],
    }));
    const { state } = await openVault({ 'references/library.json': JSON.stringify(books) });
    const view = state().pageViews.find((v) => v.id === 'references.zoteroLibrary');
    if (!view) throw new Error('Missing Zotero references page');
    render(<>{view.render(null)}</>);
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(106);
    // Keywords and tags in the file show as tags beside the list.
    const nav = screen.getByRole('navigation', { name: 'Collections' });
    fireEvent.click(within(nav).getByRole('button', { name: 'Cell repair' }));
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByRole('table').textContent).toContain('Paper 104');
    fireEvent.click(within(nav).getByRole('button', { name: /^All references/ }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'paper104' } });
    fireEvent.click(screen.getByRole('button', { name: 'Paper 104' }));
    const details = screen.getByRole('complementary', { name: 'Reference details' });
    fireEvent.click(within(details).getByRole('button', { name: 'Download PDF' }));
    expect(screen.getByLabelText<HTMLInputElement>('PDF link').value).toBe(
      'https://example.org/fulltext',
    );
  });
  it('names cited works from the library in the vault', async () => {
    const { provider } = await openVault({ 'references/library.json': LIBRARY });
    expect(provider().describe('smith2024')).toEqual({
      short: 'Smith et al. 2024',
      full: expect.stringContaining('Tau spreads') as string,
    });
    expect(provider().describe('missing')).toBeNull();
    expect((await provider().suggest('lee')).map((c) => c.key)).toEqual(['lee2023', 'smith2024']);
  });

  it('waits for the library before answering the [@ menu, so it never comes up empty', async () => {
    const { platform, state } = await openVault({ 'references/library.json': LIBRARY });
    // Ask straight after switching the module on again, before the library is read.
    await act(async () => {
      await state().setModuleEnabled('references', false);
    });
    const switchedOn = state().setModuleEnabled('references', true);
    await vi.waitFor(() => {
      expect(state().citationProvider()).not.toBeNull();
    });
    const asked = state().citationProvider()?.suggest('smi');
    await act(async () => {
      await switchedOn;
    });
    expect((await asked)?.map((c) => c.key)).toEqual(['smith2024', 'lee2023']);
    expect(platform.snapshot()['references/library.json']).toBe(LIBRARY);
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
    fireEvent.click(screen.getByText('Configure Reading and writing', { exact: true }));
    expect(screen.getByText('references/library.json')).toBeDefined();
    expect(screen.getByRole('status', { name: 'Reference library status' }).textContent).toBe(
      'No file there yet.',
    );
    expect(screen.getByRole('button', { name: 'Choose Better BibTeX file' })).toBeDefined();
  });

  it('can read a library chosen elsewhere in the vault, and remembers it', async () => {
    const { platform, store, provider } = await openVault({ 'Zotero/My library.json': LIBRARY });
    render(
      <AppStoreProvider store={store}>
        <ModulesPanel />
      </AppStoreProvider>,
    );
    await settle();
    fireEvent.click(screen.getByText('Configure Reading and writing', { exact: true }));
    expect(provider().describe('smith2024')).toBeNull();

    platform.queueFilePick(['C:/Vault/Zotero/My library.json']);
    fireEvent.click(screen.getByRole('button', { name: 'Choose Better BibTeX file' }));
    await vi.waitFor(() => {
      expect(provider().describe('smith2024')).not.toBeNull();
    });
    expect(screen.getByRole('status', { name: 'Reference library status' }).textContent).toMatch(
      /^3 references, last changed /,
    );
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
    fireEvent.click(screen.getByText('Configure Reading and writing', { exact: true }));
    platform.queueFilePick(['D:/Elsewhere/library.json']);
    fireEvent.click(screen.getByRole('button', { name: 'Choose Better BibTeX file' }));
    await vi.waitFor(() => {
      expect(state().sidebarNotice).toContain('Choose a file inside the vault');
    });
  });

  it('offers up to 50 references in the [@ menu', async () => {
    const many = JSON.stringify(
      Array.from({ length: 70 }, (_, i) => ({
        id: `ref${String(i)}`,
        title: `Work ${String(i)}`,
        author: [{ family: 'Author' }],
        issued: { 'date-parts': [[2000 + (i % 25)]] },
      })),
    );
    const { provider } = await openVault({ 'references/library.json': many });
    expect(await provider().suggest('')).toHaveLength(50);
    expect(await provider().suggest('author')).toHaveLength(50);
    // The exact key first, then keys that start with it, newest first.
    const keys = (await provider().suggest('ref6')).map((c) => c.key);
    expect(keys[0]).toBe('ref6');
    expect(keys.slice(1, 4)).toEqual(['ref69', 'ref68', 'ref67']);
    expect(keys).toHaveLength(11);
  });

  it('lists the library in the sidebar, and opens a reference’s note from it', async () => {
    const { store, state } = await openVault({ 'references/library.json': LIBRARY });
    render(
      <AppStoreProvider store={store}>
        <ModulePanels />
      </AppStoreProvider>,
    );
    await settle();
    // Panels start folded to their heading.
    fireEvent.click(screen.getByRole('button', { name: 'Library' }));
    const list = screen.getByRole('list', { name: 'References' });
    expect(
      within(list)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Smith et al. 2024Tau spreads in the fly brain',
      'Lee and Smith 2023Climbing assays revisited',
      'WHO 2020Guidance',
    ]);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a reference' }), {
      target: { value: 'climb' },
    });
    expect(within(list).getAllByRole('button')).toHaveLength(1);

    await act(async () => {
      fireEvent.click(within(list).getByRole('button', { name: /Lee and Smith 2023/ }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(state().page?.path).toBe('references/lee2023.md');
    await act(async () => {
      await state().indexIdle();
    });
    await vi.waitFor(() => {
      expect(
        within(list).getByRole('button', { name: /Lee and Smith 2023/ }).textContent,
      ).toContain('Note');
    });
  });

  it('says in the sidebar when there is no library yet', async () => {
    const { store } = await openVault();
    render(
      <AppStoreProvider store={store}>
        <ModulePanels />
      </AppStoreProvider>,
    );
    await settle();
    // Panels start folded to their heading.
    fireEvent.click(screen.getByRole('button', { name: 'Library' }));
    expect(screen.getByText(/No library yet/)).toBeDefined();
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
  it('connects a Zotero account, keeps the key off the vault, and browses by collection', async () => {
    const key = 'abcdefghijklmnopqrstuvwx';
    const { store, platform, state } = await openVault({ 'references/library.json': LIBRARY });
    const api = 'https://api.zotero.org';
    platform.serveWeb(
      `${api}/keys/${key}`,
      JSON.stringify({ userID: 42, username: 'ray', access: { user: { library: true } } }),
    );
    platform.serveWeb(
      `${api}/users/42/collections`,
      JSON.stringify([
        { key: 'TH', version: 2, data: { key: 'TH', name: 'Thesis', parentCollection: false } },
      ]),
    );
    const article = (key: string, title: string, family: string, year: number, extra = {}) => ({
      key,
      version: 2,
      data: { key, itemType: 'journalArticle', title, collections: [], tags: [], ...extra },
      csljson: { id: '42/' + key, title, author: [{ family }], issued: { 'date-parts': [[year]] } },
    });
    platform.serveWeb(
      `${api}/users/42/items`,
      JSON.stringify([
        article('Z1', 'Tau spreads in the fly brain', 'Smith', 2024, {
          DOI: '10.1016/j.neuron.2024.01.001',
          collections: ['TH'],
        }),
        article('Z2', 'A new book', 'Okafor', 2026),
      ]),
    );
    render(
      <AppStoreProvider store={store}>
        <ModulesPanel />
      </AppStoreProvider>,
    );
    await settle();
    fireEvent.click(screen.getByText('Configure Reading and writing', { exact: true }));
    fireEvent.change(screen.getByLabelText('Zotero key'), { target: { value: key } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await settle();
    await settle();
    expect(screen.getByText(/Connected as ray/)).toBeDefined();
    expect(screen.getByText('references/zotero-library.json')).toBeDefined();

    const files = platform.snapshot();
    const copy = JSON.parse(files['references/zotero-library.json'] ?? '{}') as {
      items: { 'citation-key': string }[];
    };
    // The old file's key is kept for the same paper; the new one gets its own.
    expect(copy.items.map((i) => i['citation-key'])).toEqual([
      'smith2024',
      expect.stringMatching(/^Okafor2026-[a-z]{2}$/) as string,
    ]);
    expect(Object.values(files).join('\n')).not.toContain(key);

    const view = state().pageViews.find((v) => v.id === 'references.zoteroLibrary');
    if (!view) throw new Error('Missing Zotero references page');
    render(<>{view.render(null)}</>);
    await settle();
    const nav = screen.getByRole('navigation', { name: 'Collections' });
    fireEvent.click(within(nav).getByRole('button', { name: /Thesis/ }));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    expect(within(table).getByText('Tau spreads in the fly brain')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await settle();
    expect(screen.getByText('references/library.json')).toBeDefined();
    expect(platform.snapshot()['references/zotero-library.json']).toBeDefined();
  });
});
