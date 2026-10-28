import type { BackupFile } from '../platform';
import {
  BACKUP_KEEP_RANGE,
  defaultBackupPlan,
  saveAppSettings,
  type BackupPlan,
} from '../settings/appSettings';
import { describeError, type StoreContext } from './context';

/** How long after a vault opens before a backup that is due starts, in ms. */
export const BACKUP_START_DELAY_MS = 15_000;
/** How often to see whether a backup is due while a vault is open, in ms. */
export const BACKUP_CHECK_MS = 30 * 60_000;

const DAY_MS = 24 * 60 * 60_000;

/** A time as backup names write it: `2026-10-28 1330`. */
export function backupStamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}`;
}

/** Whether a plan's next backup is due. */
export function backupDue(plan: BackupPlan, now: Date): boolean {
  if (plan.folder === null || plan.every === 'off') return false;
  if (plan.last === null) return true;
  const gap = plan.every === 'day' ? DAY_MS : 7 * DAY_MS;
  // A little early is fine, so a daily backup does not creep later each day.
  return now.getTime() - Date.parse(plan.last) >= gap - 60 * 60_000;
}

/** The last part of a full path: the vault's name. */
function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Vault';
}

export interface BackupSlice {
  /** The open vault's backups in its backup folder, oldest first; null until read. */
  backupList: BackupFile[] | null;
  backupBusy: boolean;
  /** What happened last, or why it failed, for Settings. */
  backupMessage: string | null;
  /** The open vault's backup plan on this device. */
  backupPlan: () => BackupPlan;
  setBackupPlan: (changes: Partial<BackupPlan>) => Promise<void>;
  chooseBackupFolder: () => Promise<void>;
  backUpNow: () => Promise<void>;
  refreshBackups: () => Promise<void>;
  /** Unpacks a backup into a new folder beside it; resolves to that folder, or null if it failed. */
  restoreBackup: (path: string) => Promise<string | null>;
}

export function createBackupSlice(ctx: StoreContext): BackupSlice {
  const { platform, set, get } = ctx;
  let timers: ReturnType<typeof setTimeout>[] = [];

  const vaultRoot = (): string | null => {
    const status = get().status;
    return status.kind === 'open' ? status.vault.root : null;
  };

  async function savePlan(plan: BackupPlan): Promise<void> {
    const root = vaultRoot();
    if (root === null) return;
    const settings = { ...get().settings, backups: { ...get().settings.backups, [root]: plan } };
    set({ settings });
    await saveAppSettings(platform, settings);
  }

  async function runIfDue(): Promise<void> {
    if (!get().backupBusy && backupDue(get().backupPlan(), new Date())) await get().backUpNow();
  }

  ctx.onVault({
    opened: () => {
      if (platform.backups === null) return;
      void get().refreshBackups();
      timers = [
        setTimeout(() => void runIfDue(), BACKUP_START_DELAY_MS),
        setInterval(() => void runIfDue(), BACKUP_CHECK_MS),
      ];
    },
    closing: () => {
      for (const t of timers) clearTimeout(t);
      timers = [];
    },
    closed: () => {
      set({ backupList: null, backupBusy: false, backupMessage: null });
    },
  });

  return {
    backupList: null,
    backupBusy: false,
    backupMessage: null,

    backupPlan: () => {
      const root = vaultRoot();
      return (root !== null ? get().settings.backups[root] : undefined) ?? defaultBackupPlan();
    },

    setBackupPlan: async (changes) => {
      const plan = { ...get().backupPlan(), ...changes };
      plan.keep = Math.min(BACKUP_KEEP_RANGE.max, Math.max(BACKUP_KEEP_RANGE.min, plan.keep));
      try {
        await savePlan(plan);
      } catch (err) {
        set({ backupMessage: `The backup settings could not be saved. ${describeError(err)}` });
      }
      if (changes.folder !== undefined) await get().refreshBackups();
    },

    chooseBackupFolder: async () => {
      const folder = await platform.pickFolder({ title: 'Choose a folder for backups' });
      if (folder !== null) await get().setBackupPlan({ folder });
    },

    backUpNow: async () => {
      const root = vaultRoot();
      const plan = get().backupPlan();
      if (platform.backups === null || root === null || plan.folder === null) return;
      set({ backupBusy: true, backupMessage: null });
      const now = new Date();
      try {
        const made = await platform.backups.backUp(
          plan.folder,
          folderName(root),
          backupStamp(now),
          plan.keep,
        );
        await savePlan({ ...plan, last: now.toISOString() });
        set({ backupMessage: `Backed up to ${made.name}.` });
      } catch (err) {
        set({ backupMessage: `The vault could not be backed up. ${describeError(err)}` });
      } finally {
        set({ backupBusy: false });
      }
      await get().refreshBackups();
    },

    refreshBackups: async () => {
      const root = vaultRoot();
      const plan = get().backupPlan();
      if (platform.backups === null || root === null || plan.folder === null) {
        set({ backupList: null });
        return;
      }
      try {
        set({ backupList: await platform.backups.list(plan.folder, folderName(root)) });
      } catch {
        set({ backupList: [] });
      }
    },

    restoreBackup: async (path) => {
      if (platform.backups === null) return null;
      try {
        const folder = await platform.backups.restore(path);
        set({ backupMessage: null });
        return folder;
      } catch (err) {
        set({ backupMessage: `The backup could not be restored. ${describeError(err)}` });
        return null;
      }
    },
  };
}
