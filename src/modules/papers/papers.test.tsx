import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createContributions } from '@core/modules/contributions';
import { validateManifest } from '@core/modules/manifest';
import { ModuleRegistry, type ModuleSource } from '@core/modules/registry';
import { fakeModule } from '@core/modules/testModules';
import { MemoryAdapter } from '@core/platform/memory';
import { createAppStore } from '@core/state/appStore';
import { App } from '@core/ui/App';
import { AppStoreProvider } from '@core/ui/AppStoreContext';
import manifestJson from './manifest.json';
import { parseResults, plain, SEARCH_URL, searchUrl, shortAuthors } from './europePmc';
import { newestPapers, noteFor } from './store';

// Tests may reach core internals to set the app up; the module itself may not.

/** A search answer shaped like Europe PMC's. */
const ANSWER = JSON.stringify({
  hitCount: 3,
  resultList: {
    result: [
      {
        id: '42822610',
        source: 'MED',
        title: 'Differential effects of amyloid-β and <i>tau</i> on UCH gene expression.',
        authorString: 'Arayesh MJ, Ataellahi F, Masoudi R, Smith J.',
        journalInfo: { journal: { title: 'Gene' } },
        firstPublicationDate: '2026-10-01',
        doi: '10.1016/j.gene.2026.150431',
        abstractText: '<h4>Background</h4>Alzheimer&#39;s disease is common.<h4>Methods</h4>Flies.',
        isOpenAccess: 'N',
      },
      {
        id: 'PPR123',
        source: 'PPR',
        title: 'Tau spreads in the fly brain',
        authorString: 'Lee A.',
        bookOrReportDetails: { publisher: 'bioRxiv' },
        firstPublicationDate: '2026-10-29',
        isOpenAccess: 'Y',
      },
      { id: '', source: 'MED', title: 'No id, left out' },
    ],
  },
});

describe('Latest papers: Europe PMC', () => {
  it('asks for the last month, newest first, leaving out preprints if asked', () => {
    const topic = { id: 't', name: 'Tau', query: 'tau AND fly', preprints: false };
    const url = new URL(searchUrl(topic, new Date(2026, 9, 30)));
    expect(`${url.origin}${url.pathname}`).toBe(SEARCH_URL);
    expect(url.searchParams.get('query')).toBe(
      '(tau AND fly) AND FIRST_PDATE:[2026-09-30 TO 2026-10-30] AND NOT SRC:PPR',
    );
    expect(url.searchParams.get('sort')).toBe('FIRST_PDATE_D desc');
    expect(
      new URL(searchUrl({ ...topic, preprints: true }, new Date(2026, 9, 30))).searchParams.get(
        'query',
      ),
    ).not.toContain('PPR');
  });

  it('reads papers from the answer, as plain text', () => {
    const papers = parseResults(ANSWER);
    expect(papers).toHaveLength(2);
    expect(papers[0]).toMatchObject({
      key: 'MED/42822610',
      title: 'Differential effects of amyloid-β and tau on UCH gene expression',
      journal: 'Gene',
      doi: '10.1016/j.gene.2026.150431',
      abstract: "Background\nAlzheimer's disease is common.\nMethods\nFlies.",
      url: 'https://europepmc.org/article/MED/42822610',
      preprint: false,
    });
    expect(papers[1]).toMatchObject({ journal: 'bioRxiv', preprint: true, openAccess: true });
    expect(() => parseResults('{"errMsg":"Busy"}')).toThrow('Europe PMC: Busy');
    expect(() => parseResults('<html>')).toThrow('could not be read');
    expect(plain('a &amp; b <b>c</b>')).toBe('a & b c');
    expect(plain('Responses in the &lt;i&gt;Drosophila&lt;/i&gt; larva')).toBe(
      'Responses in the Drosophila larva',
    );
    expect(plain('p &lt; 0.05 and q > 1, <sup>2</sup>')).toBe('p < 0.05 and q > 1, 2');
    expect(shortAuthors('A, B, C, D')).toBe('A, B, C, et al.');
  });

  it('makes notes, and lists the newest papers across topics once each', () => {
    const [paper] = parseResults(ANSWER);
    if (!paper) throw new Error('No paper');
    const note = noteFor(paper, { id: 't', name: 'Tau flies', query: 'tau', preprints: true });
    expect(note.properties).toMatchObject({
      doi: '10.1016/j.gene.2026.150431',
      url: 'https://doi.org/10.1016/j.gene.2026.150431',
      tags: ['paper', 'tau-flies'],
    });
    expect(note.body).toContain('## Notes');
    const papers = parseResults(ANSWER);
    const topics = [
      { id: 'a', name: 'A', query: 'a', preprints: true },
      { id: 'b', name: 'B', query: 'b', preprints: true },
    ];
    const newest = newestPapers(
      { topics, results: { a: { fetched: 0, papers }, b: { fetched: 0, papers } } },
      5,
    );
    expect(newest.map((n) => n.paper.key)).toEqual(['PPR/PPR123', 'MED/42822610']);
  });
});

function source(): ModuleSource {
  const result = validateManifest(manifestJson, 'papers');
  if (!result.ok) throw new Error(result.errors.join(', '));
  return { manifest: result.manifest, load: async () => (await import('./index')).default };
}

async function renderApp(extra: ModuleSource[] = []) {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork/config.json': JSON.stringify({
          version: 1,
          modules: { papers: { enabled: true } },
        }),
      },
    },
  });
  platform.serveWeb(SEARCH_URL, ANSWER);
  const registry = new ModuleRegistry([source(), ...extra], [], {
    platform,
    device: 'desktop',
    contributions: createContributions(),
  });
  const store = createAppStore(platform, registry);
  platform.queuePick('C:/Vault');
  await act(async () => {
    await store.getState().start();
    await store.getState().chooseFolder('open');
  });
  render(
    <AppStoreProvider store={store}>
      <App />
    </AppStoreProvider>,
  );
  return { store, platform, registry };
}

const settle = (ms = 30) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

describe('Latest papers: the view', () => {
  it('follows a topic, lists its papers, opens one and makes a note', async () => {
    const { store, platform } = await renderApp();
    await settle();
    expect(screen.getByRole('region', { name: 'Latest papers' }).textContent).toContain(
      'Follow a topic',
    );

    await act(() => store.getState().openModuleView('papers.view'));
    fireEvent.click(screen.getByRole('button', { name: 'Follow a topic' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Tau flies' } });
    fireEvent.change(screen.getByLabelText('Search words'), { target: { value: 'tau AND fly' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add topic' }));
    await settle();

    expect(platform.fetched).toHaveLength(1);
    const list = screen.getByRole('region', { name: 'Tau flies' });
    const paper = within(list).getByRole('listitem', {
      name: 'Differential effects of amyloid-β and tau on UCH gene expression',
    });
    fireEvent.click(within(paper).getByRole('button', { name: /Differential effects/ }));
    expect(paper.textContent).toContain("Alzheimer's disease is common.");

    fireEvent.click(within(paper).getByRole('button', { name: 'Open' }));
    await settle();
    expect(platform.openedLinks).toEqual(['https://europepmc.org/article/MED/42822610']);

    fireEvent.click(within(paper).getByRole('button', { name: 'Make a note' }));
    await settle(80);
    const path = 'Reading/Differential effects of amyloid-β and tau on UCH gene expression.md';
    expect(platform.snapshot()[path]).toContain('doi: 10.1016/j.gene.2026.150431');
    expect(store.getState().page?.path).toBe(path);

    // Topics are kept, with their last papers, for next time.
    const saved = platform.snapshot()['.benchwork/modules/papers/topics.json'] ?? '';
    expect(JSON.parse(saved)).toMatchObject({ topics: [{ name: 'Tau flies' }] });
  });

  it('says plainly when the site cannot be reached', async () => {
    const { store, platform } = await renderApp();
    platform.serveWeb(SEARCH_URL, new Error('The site could not be reached.'));
    await act(() => store.getState().openModuleView('papers.view'));
    fireEvent.click(screen.getByRole('button', { name: 'Follow a topic' }));
    fireEvent.change(screen.getByLabelText('Search words'), { target: { value: 'tau' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add topic' }));
    await settle();
    expect(screen.getByRole('alert').textContent).toBe('The site could not be reached.');
  });

  it('only modules that name a site may read from it', async () => {
    const tried: { attempt: Promise<string> | null } = { attempt: null };
    const nosy = fakeModule('nosy', [], {
      activate: (ctx) => {
        tried.attempt = ctx.web.getText(`${SEARCH_URL}?query=x`).then(
          () => 'read',
          (err: unknown) => (err instanceof Error ? err.message : String(err)),
        );
      },
    });
    const { store } = await renderApp([nosy]);
    await act(() => store.getState().setModuleEnabled('nosy', true));
    expect(await tried.attempt).toContain('only read from the sites in its manifest');
  });
});
