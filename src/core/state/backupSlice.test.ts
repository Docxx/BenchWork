// @vitest-environment node
import { MemoryAdapter } from '../platform/memory';
import { defaultBackupPlan, parseAppSettings } from '../settings/appSettings';
import { createAppStore } from './appStore';
import { backupDue, backupStamp } from './backupSlice';

async function openVault() {
  const platform = new MemoryAdapter({
    folders: {
      'C:/Lab vault': {
        '.benchwork/config.json': '{"version":1}',
        '.benchwork/index.sqlite': 'local index',
        'Lab/Plan.md': '# Plan\n',
      },
      'D:/Backups': {},
    },
  });
  const store = createAppStore(platform);
  platform.queuePick('C:/Lab vault');
  await store.getState().chooseFolder('open');
  return { platform, store, state: () => store.getState() };
}

describe('backup times', () => {
  it('are written for file names, and due by the plan', () => {
    expect(backupStamp(new Date(2026, 9, 28, 9, 5))).toBe('2026-10-28 0905');
    const plan = { ...defaultBackupPlan(), folder: 'D:/Backups', every: 'day' as const };
    const now = new Date(2026, 9, 28, 12, 0);
    expect(backupDue(plan, now)).toBe(true);
    expect(backupDue({ ...plan, last: new Date(2026, 9, 28, 9, 0).toISOString() }, now)).toBe(
      false,
    );
    expect(backupDue({ ...plan, last: new Date(2026, 9, 27, 12, 0).toISOString() }, now)).toBe(
      true,
    );
    expect(backupDue({ ...plan, every: 'off' }, now)).toBe(false);
    expect(backupDue({ ...plan, folder: null }, now)).toBe(false);
  });

  it('are read back from settings, keeping only what makes sense', () => {
    const settings = parseAppSettings({
      backups: {
        'C:/Lab vault': { folder: 'D:/Backups', every: 'day', keep: 500, last: 'yesterday' },
        'C:/Other': 'junk',
      },
    });
    expect(settings.backups).toEqual({
      'C:/Lab vault': { folder: 'D:/Backups', every: 'day', keep: 100, last: null },
    });
  });
});

describe('vault backups', () => {
  it('back the vault up into the chosen folder, without the search index, keeping the newest', async () => {
    const { platform, state } = await openVault();
    platform.queuePick('D:/Backups');
    await state().chooseBackupFolder();
    await state().setBackupPlan({ keep: 2 });
    for (let i = 0; i < 3; i += 1) {
      await state().backUpNow();
      // A new name each time, as backups are named by the minute.
      vi.setSystemTime(Date.now() + 60_000);
    }
    vi.useRealTimers();
    expect(state().backupList?.map((b) => b.name)).toHaveLength(2);
    expect(state().backupPlan().last).not.toBeNull();
    const latest = state().backupList?.at(-1);
    expect(latest?.name).toMatch(/^Lab vault backup \d{4}-\d\d-\d\d \d{4}\.zip$/);
    const saved = platform.snapshot('D:/Backups')[latest?.name ?? ''] ?? '';
    expect(saved).toContain('Lab/Plan.md');
    expect(saved).not.toContain('index.sqlite');
  });

  it('restore a backup into a new folder, which can then be opened', async () => {
    const { platform, state } = await openVault();
    platform.queuePick('D:/Backups');
    await state().chooseBackupFolder();
    await state().backUpNow();
    const backup = state().backupList?.[0];
    const folder = await state().restoreBackup(backup?.path ?? '');
    expect(folder).toMatch(/^D:\/Backups\/Lab vault restored from /);
    await state().switchToVault(folder ?? '');
    const status = state().status;
    expect(status.kind === 'open' ? status.vault.root : null).toBe(folder);
    expect(platform.snapshot()['Lab/Plan.md']).toBe('# Plan\n');
    // Restoring the same backup again never unpacks over the first copy.
    expect(await state().restoreBackup(backup?.path ?? '')).toBeNull();
  });
});
