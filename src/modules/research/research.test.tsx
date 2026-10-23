import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { createContributions } from '@core/modules/contributions';
import { validateManifest } from '@core/modules/manifest';
import { ModuleRegistry, type ModuleSource } from '@core/modules/registry';
import { parsePage } from '@core/pages/frontmatter';
import { MemoryAdapter } from '@core/platform/memory';
import { createAppStore } from '@core/state/appStore';
import { AppStoreProvider } from '@core/ui/AppStoreContext';
import { PageView } from '@core/ui/PageView';
import manifestJson from './manifest.json';
import { datasetFiles } from './datasets';
import { findProjectHub } from './projects';

// Tests may reach core internals to set the app up; the module itself may not.

function source(): ModuleSource {
  const result = validateManifest(manifestJson, 'research');
  if (!result.ok) throw new Error(result.errors.join(', '));
  return { manifest: result.manifest, load: async () => (await import('./index')).default };
}

async function openVault(enabled = true) {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Vault': {
        '.benchwork/config.json': JSON.stringify({
          version: 1,
          modules: { research: { enabled } },
        }),
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
  return { platform, store, state: () => store.getState() };
}

/** Runs a command that asks for a name, and answers it. */
async function runWithName(
  state: () => ReturnType<Awaited<ReturnType<typeof openVault>>['state']>,
  id: string,
  folder: string | null,
  name: string,
) {
  const running = state().runCommand(id, { folder });
  await vi.waitFor(() => {
    expect(state().textPrompt).not.toBeNull();
  });
  state().answerText(name);
  await running;
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

describe('Research module: projects and experiments', () => {
  it('makes a project: a notebook with a hub page and sections', async () => {
    const { platform, state } = await openVault();
    await runWithName(state, 'research.newProject', null, 'LPS model');
    const files = platform.snapshot();
    expect(files).toHaveProperty(['LPS model/Experiments'], null);
    expect(files).toHaveProperty(['LPS model/Data'], null);
    const hub = parsePage(files['LPS model/project.md'] ?? '');
    expect(hub.meta.type).toBe('project');
    expect(hub.body).toContain('## Aim');
    expect(state().page?.path).toBe('LPS model/project.md');
  });

  it('makes experiments that link to their project', async () => {
    const { platform, state } = await openVault();
    await runWithName(state, 'research.newProject', null, 'LPS model');
    const path = await state().createTypedPage('LPS model/Experiments', 'experiment', 'LPS dose');
    const page = parsePage(platform.snapshot()[path ?? ''] ?? '');
    expect(page.meta.type).toBe('experiment');
    expect(page.yaml).toMatch(/\nproject: "\[\[project\]\]"/);
    expect(page.yaml).toMatch(/\nstatus: planned/);
    expect(page.yaml).toMatch(/\ndate: \d{4}-\d{2}-\d{2}/);
    const vault = { exists: (p: string) => platform.exists(p) };
    const ctx = { vault } as unknown as Parameters<typeof findProjectHub>[0];
    expect(await findProjectHub(ctx, 'LPS model/Experiments')).toBe('LPS model/project.md');
    expect(await findProjectHub(ctx, 'Elsewhere/Notes')).toBeNull();
  });

  it('makes experiments outside a project without a project link', async () => {
    const { platform, state } = await openVault();
    await state().createNotebook('Loose');
    const path = await state().createTypedPage('Loose', 'experiment', 'Pilot');
    expect(platform.snapshot()[path ?? '']).not.toContain('project:');
  });
});

describe('Research module: datasets', () => {
  async function withDataset() {
    const opened = await openVault();
    const { platform, state } = opened;
    await runWithName(state, 'research.newProject', null, 'LPS model');
    platform.addExternalFile('D:/Raw/day7/video.avi', 'big video');
    await platform.writeTextAtomic('LPS model/Data/day7.csv', 'fly,cm\nw1118,12\n');
    await runWithName(state, 'research.newDataset', 'LPS model/Data', 'climbing-day7');
    const view = render(
      <AppStoreProvider store={opened.store}>
        <PageView />
      </AppStoreProvider>,
    );
    await settle();
    return { ...opened, view };
  }

  it('creates a record and opens it in the dataset view', async () => {
    const { platform, state } = await withDataset();
    expect(state().openFile).toBe('LPS model/Data/climbing-day7.dataset.yaml');
    expect(platform.snapshot()['LPS model/Data/climbing-day7.dataset.yaml']).toMatch(
      /^id: .+\ncreated: .+\ndescription: ""\nfiles: \[\]\n$/,
    );
    expect(screen.getByRole('heading', { name: 'climbing-day7' })).toBeTruthy();
    expect(screen.getByText('No files yet. Add the files this dataset is made of.')).toBeTruthy();
  });

  it('adds files with sizes and checksums, and checks them later', async () => {
    const { platform } = await withDataset();
    platform.queueFilePick(['C:/Vault/LPS model/Data/day7.csv', 'D:/Raw/day7/video.avi']);
    fireEvent.click(screen.getByRole('button', { name: 'Add files…' }));
    await settle();

    const record = platform.snapshot()['LPS model/Data/climbing-day7.dataset.yaml'] ?? '';
    expect(record).toContain('external: D:/Raw/day7');
    const { parseRecord } = await import('@core/records/records');
    const files = datasetFiles(parseRecord(record).data);
    expect(files.map((f) => [f.path, f.size])).toEqual([
      ['LPS model/Data/day7.csv', 16],
      ['D:/Raw/day7/video.avi', 9],
    ]);
    expect(files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256 ?? ''))).toBe(true);

    const table = screen.getByRole('table', { name: 'Dataset files' });
    fireEvent.click(screen.getByRole('button', { name: 'Check files' }));
    await settle();
    expect(within(table).getAllByText('Unchanged')).toHaveLength(2);

    platform.addExternalFile('D:/Raw/day7/video.avi', 'different');
    fireEvent.click(screen.getByRole('button', { name: 'Check files' }));
    await settle();
    expect(within(table).getByText('Changed')).toBeTruthy();
  });

  it('links to its experiment, and both are found in search', async () => {
    const { platform, state } = await withDataset();
    const experiment = await state().createTypedPage(
      'LPS model/Experiments',
      'experiment',
      'LPS dose',
    );
    await act(async () => {
      state().setPageProperties({ aim: 'Climbing after LPS', datasets: ['[[climbing-day7]]'] });
      await state().savePageNow();
      await state().indexIdle();
    });
    await act(async () => {
      await state().openPath('LPS model/Data/climbing-day7.dataset.yaml');
    });
    await settle();
    fireEvent.change(screen.getByLabelText('Experiment'), { target: { value: experiment } });
    await settle();
    expect(platform.snapshot()['LPS model/Data/climbing-day7.dataset.yaml']).toContain(
      'experiment: "[[LPS dose]]"',
    );
    const linked = screen.getByRole('region', { name: 'Linked from' });
    expect(within(linked).getByRole('button', { name: 'LPS dose' })).toBeTruthy();

    await act(async () => {
      await state().indexIdle();
    });
    const found = (await platform.index.search('climbing', 10)).map((h) => h.path).sort();
    expect(found).toEqual([
      'LPS model/Data/climbing-day7.dataset.yaml',
      'LPS model/Experiments/LPS dose.md',
    ]);
  });

  it('checks every dataset from the command list', async () => {
    const { platform, state } = await withDataset();
    platform.queueFilePick(['D:/Raw/day7/video.avi']);
    fireEvent.click(screen.getByRole('button', { name: 'Add files…' }));
    await settle();
    await act(async () => {
      await state().indexIdle();
      await state().runCommand('research.checkDatasets', { folder: null });
    });
    expect(state().sidebarNotice).toBe('Checked 1 file in 1 datasets. All are unchanged.');
    platform.addExternalFile('D:/Raw/day7/video.avi', 'changed');
    await act(async () => {
      await state().runCommand('research.checkDatasets', { folder: null });
    });
    expect(state().sidebarNotice).toContain('D:/Raw/day7/video.avi in climbing-day7 has changed');
  });
});

describe('Research module: switched off', () => {
  it('leaves its files alone, and they still open', async () => {
    const { platform, state, store } = await openVault();
    await runWithName(state, 'research.newProject', null, 'LPS model');
    await runWithName(state, 'research.newDataset', 'LPS model/Data', 'day7');
    await state().createTypedPage('LPS model/Experiments', 'experiment', 'Dose');
    await state().closePage();
    const before = platform.snapshot();

    await act(async () => {
      await state().setModuleEnabled('research', false);
    });
    expect(state().pageTypes).toEqual([]);
    expect(state().fileHandlers).toEqual([]);
    expect(platform.snapshot()).toEqual({
      ...before,
      '.benchwork/config.json': platform.snapshot()['.benchwork/config.json'],
    });

    render(
      <AppStoreProvider store={store}>
        <PageView />
      </AppStoreProvider>,
    );
    await act(async () => {
      await state().openPath('LPS model/Data/day7.dataset.yaml');
    });
    await settle();
    expect(screen.getByText(/Switch on the module that uses it/)).toBeTruthy();

    await act(async () => {
      await state().openPath('LPS model/Experiments/Dose.md');
    });
    // An ordinary page now; its properties are still shown and kept.
    expect(state().pageProperties).toMatchObject({ type: 'experiment', status: 'planned' });
    expect(screen.getByRole('region', { name: 'Properties' })).toBeTruthy();
  });
});
