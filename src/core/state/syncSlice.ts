import { isInk, mergeInk, parseInk, serialiseInk } from '../ink/inkFile';
import { freeName } from '../notebooks/notebookService';
import { baseName, parentVaultPath, type DirEntry } from '../platform';
import { splitName } from '../pages/attachments';
import { conflictCopy, withSyncIgnore, type ConflictCopy } from '../sync/conflicts';
import { describeError, type StoreContext } from './context';

/** Syncthing puts this folder in every folder it syncs. */
export const SYNCTHING_MARKER = '.stfolder';

/** Wait after files change before looking for conflict copies again. */
export const CONFLICT_SCAN_DELAY_MS = 500;

/** How a page's conflict is settled. */
export type ConflictChoice =
  /** Keep the page as it is; the other copy goes to the Recycle Bin. */
  | 'current'
  /** The page becomes the other copy. */
  | 'other'
  /** Keep the other copy as a page of its own, beside it. */
  | 'both';

export interface SyncSlice {
  /** Conflict copies still to settle, oldest first. Drawings never wait here: they merge by themselves. */
  conflicts: ConflictCopy[];
  /** Why settling a conflict failed, for the Differences view. */
  conflictError: string | null;
  /** Looks through the vault for conflict copies again. */
  refreshConflicts: () => Promise<void>;
  resolveConflict: (copy: string, choice: ConflictChoice) => Promise<void>;
  /** Reads a copy and its page, for showing side by side; null for one that cannot be read. */
  readConflict: (copy: string) => Promise<{ current: string | null; other: string } | null>;
}

export function createSyncSlice(ctx: StoreContext): SyncSlice {
  const { platform, set, get } = ctx;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopWatching: (() => void) | null = null;

  /** Every conflict copy in the vault, outside BenchWork's own folder. */
  async function findCopies(): Promise<ConflictCopy[]> {
    const found: ConflictCopy[] = [];
    const visit = async (folder: string) => {
      let entries: DirEntry[];
      try {
        entries = await platform.listDir(folder);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isDir) {
          if (!entry.name.startsWith('.')) await visit(entry.path);
        } else {
          const copy = conflictCopy(entry.path);
          if (copy) found.push(copy);
        }
      }
    };
    await visit('');
    return found.sort((a, b) => a.when.getTime() - b.when.getTime());
  }

  /** Drawings merge by keeping every stroke from both; true if this one was merged. */
  async function mergeDrawing(c: ConflictCopy): Promise<boolean> {
    if (!isInk(c.original)) return false;
    try {
      const other = parseInk(await platform.readText(c.copy));
      if (other.error !== null) return false;
      if (await platform.exists(c.original)) {
        const current = parseInk(await platform.readText(c.original));
        if (current.error !== null) return false;
        await platform.writeTextAtomic(c.original, serialiseInk(mergeInk(current.ink, other.ink)));
      } else {
        await platform.writeTextAtomic(c.original, serialiseInk(other.ink));
      }
      await platform.trash(c.copy);
      return true;
    } catch {
      return false;
    }
  }

  async function scan(): Promise<void> {
    const session = ctx.session();
    const copies = await findCopies();
    const left: ConflictCopy[] = [];
    for (const c of copies) {
      if (!(await mergeDrawing(c))) left.push(c);
    }
    if (ctx.session() === session) set({ conflicts: left });
  }

  function scheduleScan(): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void scan();
    }, CONFLICT_SCAN_DELAY_MS);
  }

  ctx.onVault({
    opened: () => {
      // Never sync the search index, recovery copies or trash: each device
      // keeps its own. Only in a folder Syncthing syncs, marked by its .stfolder.
      void (async () => {
        try {
          if (!(await platform.exists(SYNCTHING_MARKER))) return;
          const existing = (await platform.exists('.stignore'))
            ? await platform.readText('.stignore')
            : null;
          const next = withSyncIgnore(existing);
          if (next !== null) await platform.writeTextAtomic('.stignore', next);
        } catch {
          // Without it, syncing still works; only more is synced.
        }
      })();
      stopWatching = platform.watch((change) => {
        if (change.paths.some((p) => conflictCopy(p) !== null)) scheduleScan();
      });
      void scan();
    },
    closing: () => {
      stopWatching?.();
      stopWatching = null;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
    closed: () => {
      set({ conflicts: [], conflictError: null });
    },
  });

  return {
    conflicts: [],
    conflictError: null,

    refreshConflicts: () => scan(),

    readConflict: async (copy) => {
      const c = get().conflicts.find((x) => x.copy === copy);
      if (!c) return null;
      try {
        const other = await platform.readText(c.copy);
        const current = (await platform.exists(c.original))
          ? await platform.readText(c.original)
          : null;
        return { current, other };
      } catch {
        return null;
      }
    },

    resolveConflict: async (copy, choice) => {
      const c = get().conflicts.find((x) => x.copy === copy);
      if (!c) return;
      try {
        if (choice === 'other') {
          await platform.writeTextAtomic(c.original, await platform.readText(c.copy));
          await platform.trash(c.copy);
        } else if (choice === 'both') {
          const folder = parentVaultPath(c.original) ?? '';
          const { base, ext } = splitName(baseName(c.original));
          const name = await freeName(platform, folder, `${base} (other copy)`, ext);
          await platform.rename(c.copy, folder === '' ? name : `${folder}/${name}`);
        } else {
          await platform.trash(c.copy);
        }
        set({
          conflicts: get().conflicts.filter((x) => x.copy !== copy),
          conflictError: null,
        });
      } catch (err) {
        set({ conflictError: `The difference could not be settled. ${describeError(err)}` });
      }
    },
  };
}
