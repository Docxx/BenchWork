import { act, render, screen, within } from '@testing-library/react';
import { createContributions } from '@core/modules/contributions';
import { validateManifest } from '@core/modules/manifest';
import { ModuleRegistry, type ModuleSource } from '@core/modules/registry';
import { MemoryAdapter, type MemoryFolderContents } from '@core/platform/memory';
import { createAppStore } from '@core/state/appStore';
import { AppStoreProvider } from '@core/ui/AppStoreContext';
import { PageView } from '@core/ui/PageView';
import referencesManifest from '../references/manifest.json';
import manifestJson from './manifest.json';

// Tests may reach core internals to set the app up; the module itself may not.

function source(folder: string, json: unknown, load: () => Promise<unknown>): ModuleSource {
  const result = validateManifest(json, folder);
  if (!result.ok) throw new Error(result.errors.join(', '));
  return { manifest: result.manifest, load: load as ModuleSource['load'] };
}

const LIBRARY = JSON.stringify([
  {
    id: 'smith2024',
    title: 'Tau spreads',
    author: [{ family: 'Smith', given: 'Alice' }],
    issued: { 'date-parts': [[2024]] },
  },
]);

const THESIS: MemoryFolderContents = {
  'references/library.json': LIBRARY,
  'Thesis/Tau thesis.md': [
    '---',
    'id: m1',
    'type: manuscript',
    'author: Ray Price',
    '---',
    '1. [[Introduction]]',
    '2. [[Methods]]',
    '3. [[Discussion]]',
    '',
  ].join('\n'),
  'Thesis/Introduction.md': '# Introduction\n\nTau spreads in flies [@smith2024].\n',
  'Thesis/Methods.md': 'Flies were kept at 25 degrees.\n',
};

async function openVault(files: MemoryFolderContents = THESIS) {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork/config.json': JSON.stringify({
          version: 1,
          modules: { references: { enabled: true }, manuscript: { enabled: true } },
        }),
        ...files,
      },
    },
  });
  const registry = new ModuleRegistry(
    [
      source(
        'references',
        referencesManifest,
        async () => (await import('../references/index')).default,
      ),
      source('manuscript', manifestJson, async () => (await import('./index')).default),
    ],
    [],
    { platform, device: 'desktop', contributions: createContributions() },
  );
  const store = createAppStore(platform, registry);
  platform.queuePick('C:/Vault');
  await act(async () => {
    await store.getState().chooseFolder('open');
  });
  const state = () => store.getState();
  await act(async () => {
    await state().indexIdle();
  });
  return { platform, store, state };
}

function exportsOf(platform: MemoryAdapter): [string, string][] {
  return Object.entries(platform.snapshot())
    .filter(([p]) => p.startsWith('exports/'))
    .map(([p, text]) => [p, text ?? '']);
}

describe('Manuscript module', () => {
  it('exports a manuscript to Word, with citations formatted from the library', async () => {
    const { platform, state } = await openVault();
    await state().openPage('Thesis/Tau thesis.md');
    await act(async () => {
      await state().runCommand('manuscript.export', { folder: null });
    });
    const [[path, text] = ['', '']] = exportsOf(platform);
    expect(path).toMatch(/^exports\/Tau thesis \d{4}-\d{2}-\d{2} \d{4}\.docx$/);
    expect(text).toContain('bibliography: references/library.json');
    expect(text).toContain('csl: none');
    expect(text).toContain('title: "Tau thesis"\nauthor: "Ray Price"');
    expect(text).toContain('# Introduction\n\nTau spreads in flies [@smith2024].');
    expect(text).toContain('# Methods\n\nFlies were kept at 25 degrees.');
    expect(state().sidebarNotice).toContain(`Saved ${path}.`);
    expect(state().sidebarNotice).toContain('Left out, as they do not exist yet: Discussion.');
  });

  it('never replaces an earlier export', async () => {
    const { platform, state } = await openVault();
    await state().openPage('Thesis/Tau thesis.md');
    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        await state().runCommand('manuscript.export', { folder: null });
      });
    }
    expect(exportsOf(platform)).toHaveLength(2);
  });

  it('uses the manuscript’s own citation style, if it names one', async () => {
    const { platform, state } = await openVault({
      ...THESIS,
      'Thesis/Tau thesis.md': '---\ntype: manuscript\nstyle: styles/apa.csl\n---\n[[Methods]]\n',
      'styles/apa.csl': '<style/>',
    });
    await state().openPage('Thesis/Tau thesis.md');
    await act(async () => {
      await state().runCommand('manuscript.export', { folder: null });
    });
    expect(exportsOf(platform)[0]?.[1]).toContain('csl: styles/apa.csl');
  });

  it('says when Pandoc is not installed, and writes nothing', async () => {
    const { platform, state } = await openVault();
    platform.setPandoc(null);
    await state().openPage('Thesis/Tau thesis.md');
    await act(async () => {
      await state().runCommand('manuscript.export', { folder: null });
    });
    expect(state().sidebarNotice).toContain('Pandoc is not installed');
    expect(exportsOf(platform)).toEqual([]);
  });

  it('only exports manuscripts', async () => {
    const { state } = await openVault();
    await state().openPage('Thesis/Methods.md');
    await act(async () => {
      await state().runCommand('manuscript.export', { folder: null });
    });
    expect(state().sidebarNotice).toBe('Open a manuscript first.');
  });

  it('shows an overview with each part’s word count', async () => {
    const { store, state } = await openVault();
    await state().openPage('Thesis/Tau thesis.md');
    await act(async () => {
      await state().runCommand('manuscript.overview', { folder: null });
    });
    render(
      <AppStoreProvider store={store}>
        <PageView />
      </AppStoreProvider>,
    );
    const table = await screen.findByRole('table', { name: 'Parts' });
    const rows = within(table)
      .getAllByRole('row')
      .map((r) => r.textContent);
    expect(rows).toEqual([
      'PartWords',
      'Introduction5',
      'Methods6',
      'Discussion (not written yet)0',
      'Total11',
    ]);
    expect(screen.getByRole('button', { name: 'Export to Word' })).toBeDefined();
  });

  it('makes new manuscripts with a list of parts to fill in', async () => {
    const { platform, state } = await openVault({ Thesis: null });
    const running = state().runCommand('manuscript.new', { folder: 'Thesis' });
    await vi.waitFor(() => {
      expect(state().textPrompt).not.toBeNull();
    });
    state().answerText('Chapter draft');
    await act(async () => {
      await running;
    });
    expect(platform.snapshot()['Thesis/Chapter draft.md']).toContain('type: manuscript');
    expect(platform.snapshot()['Thesis/Chapter draft.md']).toContain('1. [[Introduction]]');
  });
});
