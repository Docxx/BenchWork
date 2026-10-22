// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import {
  ALWAYS_KEEP,
  KEEP_LATEST,
  listSnapshots,
  parseStamp,
  pruneSnapshots,
  saveSnapshot,
  snapshotsToDrop,
  type SnapshotRef,
} from './snapshots';

async function openVault(contents: Record<string, string | null> = {}) {
  const platform = new MemoryAdapter({ folders: { 'C:/Vault': contents } });
  await platform.setVaultRoot('C:/Vault');
  return platform;
}

const day = (n: number) => new Date(2026, 9, 22 - n, 10, 0, 0);

describe('snapshot names', () => {
  it('give the time they were taken', () => {
    expect(parseStamp('2026-10-22 103005.md')).toEqual(new Date(2026, 9, 22, 10, 30, 5));
    expect(parseStamp('2026-10-22 103005 2.md')).toEqual(new Date(2026, 9, 22, 10, 30, 5));
    expect(parseStamp('notes.md')).toBeNull();
  });
});

describe('keeping snapshots', () => {
  const refs = (count: number, daysApart = 0): SnapshotRef[] =>
    Array.from({ length: count }, (_, i) => ({ path: String(i), time: day(i * daysApart) }));

  it(`keeps at most ${String(KEEP_LATEST)} per page`, () => {
    expect(snapshotsToDrop(refs(KEEP_LATEST + 3), day(0)).map((r) => r.path)).toEqual([
      String(KEEP_LATEST),
      String(KEEP_LATEST + 1),
      String(KEEP_LATEST + 2),
    ]);
  });

  it(`drops old ones but always keeps the newest ${String(ALWAYS_KEEP)}`, () => {
    // One a fortnight: the 6th onwards are over 60 days old.
    const drop = snapshotsToDrop(refs(10, 14), day(0)).map((r) => r.path);
    expect(drop).toEqual(['5', '6', '7', '8', '9']);
    expect(snapshotsToDrop(refs(ALWAYS_KEEP, 100), day(0))).toEqual([]);
  });

  it('lists a page by id and by path, newest first, and prunes old ones', async () => {
    const platform = await openVault();
    await saveSnapshot(platform, 'Lab/Plan.md', null, 'before it had an id', day(3));
    await saveSnapshot(platform, 'Lab/Plan.md', 'p1', 'older', day(2));
    await saveSnapshot(platform, 'Lab/Plan.md', 'p1', 'newer', day(1));
    const list = await listSnapshots(platform, 'Lab/Plan.md', 'p1');
    expect(await Promise.all(list.map((s) => platform.readText(s.path)))).toEqual([
      'newer',
      'older',
      'before it had an id',
    ]);

    for (let i = 0; i < KEEP_LATEST; i += 1) {
      await saveSnapshot(
        platform,
        'Lab/Plan.md',
        'p1',
        `n${String(i)}`,
        new Date(2026, 9, 22, 11, 0, i),
      );
    }
    await pruneSnapshots(platform, 'Lab/Plan.md', 'p1', day(0));
    expect(await listSnapshots(platform, 'Lab/Plan.md', 'p1')).toHaveLength(KEEP_LATEST);
  });

  it('can only remove snapshot files', async () => {
    const platform = await openVault({
      'Lab/Plan.md': 'mine',
      '.benchwork/config.json': '{}',
      '.benchwork/snapshots/p1/2026-10-22 103005.md': 'old',
    });
    await platform.removeSnapshot('.benchwork/snapshots/p1/2026-10-22 103005.md');
    await expect(platform.removeSnapshot('Lab/Plan.md')).rejects.toThrow('not a snapshot');
    await expect(platform.removeSnapshot('.benchwork/config.json')).rejects.toThrow();
    await expect(platform.removeSnapshot('.benchwork/snapshots/p1')).rejects.toThrow();
    expect(platform.snapshot()['Lab/Plan.md']).toBe('mine');
  });
});
