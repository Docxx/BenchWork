// @vitest-environment node
import { MemoryAdapter, type MemoryFolderContents } from '../platform/memory';
import { BATCH_SIZE, IndexService, searchedPage, type IndexProgress } from './indexService';

const VAULT: MemoryFolderContents = {
  '.benchwork/config.json': '{"version":1}',
  'Lab/Experiments/Dose.md': 'LPS dose response, climbing at day 7.\n',
  'Lab/Plan.md': 'Order fly food.\n',
  'Daily/2026-10-22.md': 'Flies transferred 10:30.\n',
  'templates/Experiment.md': 'Template climbing text.\n',
  '.hidden/Secret.md': 'climbing\n',
  'Lab/data.csv': 'climbing,1\n',
};

async function setup(contents: MemoryFolderContents = VAULT) {
  const platform = new MemoryAdapter({ folders: { 'C:/Vault': contents } });
  await platform.setVaultRoot('C:/Vault');
  const progress: IndexProgress[] = [];
  let updates = 0;
  const make = () =>
    new IndexService(platform, {
      progress: (p) => progress.push(p),
      updated: () => {
        updates += 1;
      },
    });
  const service = make();
  const stopWatching = platform.watch((change) => {
    service.changed(change.paths);
  });
  const found = async (query: string) =>
    (await service.search(query, 50)).map((hit) => hit.path).sort();
  /** Lets the adapter send its batched watcher events, then waits for indexing. */
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await service.idle();
  };
  return { platform, service, make, progress, updates: () => updates, stopWatching, found, settle };
}

describe('which files are searched', () => {
  it('is pages outside hidden folders and templates', () => {
    expect(searchedPage('Lab/Plan.md')).toBe(true);
    expect(searchedPage('Plan.md')).toBe(true);
    expect(searchedPage('templates/Experiment.md')).toBe(false);
    expect(searchedPage('Lab/templates/Experiment.md')).toBe(true);
    expect(searchedPage('.benchwork/snapshots/p1/a.md')).toBe(false);
    expect(searchedPage('Lab/.draft.md')).toBe(false);
    expect(searchedPage('Lab/data.csv')).toBe(false);
    expect(searchedPage('Lab/Data/day7.dataset.yaml')).toBe(true);
    expect(searchedPage('Lab/config.yaml')).toBe(false);
  });
});

describe('IndexService', () => {
  it('indexes records beside pages, found by their values', async () => {
    const { service, found, platform } = await setup({
      ...VAULT,
      'Lab/Data/day7.dataset.yaml': 'instrument: Camera 2\nexperiment: "[[Dose]]"\n',
    });
    await service.start();
    expect(await found('camera')).toEqual(['Lab/Data/day7.dataset.yaml']);
    expect(await platform.index.pages()).toContainEqual({
      mtime: expect.any(Number) as number,
      path: 'Lab/Data/day7.dataset.yaml',
      title: 'day7',
      id: null,
      type: 'dataset',
    });
  });

  it('indexes every searched page when the vault opens', async () => {
    const { service, progress, found } = await setup();
    await service.start();
    expect(await found('climbing')).toEqual(['Lab/Experiments/Dose.md']);
    expect(await found('flies')).toEqual(['Daily/2026-10-22.md']);
    expect(progress.at(0)).toEqual({ state: 'indexing', done: 0, total: 3, error: null });
    expect(progress.at(-1)).toEqual({ state: 'ready', done: 0, total: 0, error: null });
  });

  it('reads only new and changed pages next time, and drops removed ones', async () => {
    const { platform, service, make, stopWatching, found } = await setup();
    await service.start();
    await service.stop();
    stopWatching();

    await platform.externalWrite('Lab/Plan.md', 'Order fresh yeast.\n');
    await platform.externalWrite('Lab/New.md', 'A new page.\n');
    await platform.trash('Daily');
    const reads = vi.spyOn(platform, 'readText');

    const next = make();
    await next.start();
    expect(reads.mock.calls.map(([path]) => path).sort()).toEqual(['Lab/New.md', 'Lab/Plan.md']);
    expect((await next.search('yeast', 10)).map((h) => h.path)).toEqual(['Lab/Plan.md']);
    expect(await next.search('flies', 10)).toEqual([]);
    expect(await found('climbing')).toEqual([]); // the old service is closed
  });

  it('follows changes the watcher reports', async () => {
    const { platform, service, found, settle } = await setup();
    await service.start();

    await platform.externalWrite('Lab/Plan.md', 'Order fresh yeast.\n');
    await platform.createNew('Lab/Experiments/Diet.md', 'Diet and climbing.\n');
    await settle();
    expect(await found('yeast')).toEqual(['Lab/Plan.md']);
    expect(await found('climbing')).toEqual(['Lab/Experiments/Diet.md', 'Lab/Experiments/Dose.md']);

    await platform.rename('Lab/Experiments', 'Lab/Assays');
    await settle();
    expect(await found('climbing')).toEqual(['Lab/Assays/Diet.md', 'Lab/Assays/Dose.md']);

    await platform.trash('Lab/Assays/Diet.md');
    await platform.writeTextAtomic('templates/Other.md', 'climbing template\n');
    await settle();
    expect(await found('climbing')).toEqual(['Lab/Assays/Dose.md']);
  });

  it('rebuilds from the vault', async () => {
    const { platform, service, found } = await setup();
    await service.start();
    const reads = vi.spyOn(platform, 'readText');
    await service.rebuild();
    expect(reads).toHaveBeenCalledTimes(3);
    expect(await found('climbing')).toEqual(['Lab/Experiments/Dose.md']);
  });

  it('works in batches and reports progress', async () => {
    const many: MemoryFolderContents = { '.benchwork/config.json': '{"version":1}' };
    for (let i = 0; i < BATCH_SIZE * 2 + 5; i += 1) many[`Lab/Page ${String(i)}.md`] = 'text\n';
    const { service, progress, updates } = await setup(many);
    await service.start();
    expect(progress.map((p) => [p.state, p.done, p.total])).toEqual([
      ['indexing', 0, 55],
      ['indexing', 25, 55],
      ['indexing', 50, 55],
      ['indexing', 55, 55],
      ['ready', 0, 0],
    ]);
    expect(updates()).toBe(3);
  });

  it('stops part way and closes the index', async () => {
    const many: MemoryFolderContents = { '.benchwork/config.json': '{"version":1}' };
    for (let i = 0; i < BATCH_SIZE * 4; i += 1) many[`Lab/Page ${String(i)}.md`] = 'text\n';
    const { platform, service } = await setup(many);
    const started = service.start();
    await service.stop();
    await started;
    await expect(platform.index.entries()).rejects.toThrow('not open');
    await platform.index.open();
    expect((await platform.index.entries()).length).toBeLessThan(BATCH_SIZE * 4);
  });

  it('reports an error if the index cannot be opened', async () => {
    const { platform, service, progress } = await setup();
    vi.spyOn(platform.index, 'open').mockRejectedValue(new Error('disk full'));
    await service.start();
    expect(progress.at(-1)).toMatchObject({ state: 'error', error: 'disk full' });
    expect(await service.search('climbing', 10)).toEqual([]);
  });
});
