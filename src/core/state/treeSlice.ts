import { readSectionMeta } from '../notebooks/notebookService';
import { SECTION_FILE, type SectionMeta } from '../notebooks/sectionMeta';
import { joinVaultPath, parentVaultPath, PlatformError, type DirEntry } from '../platform';
import { emptyTree, visibleEntries, type FolderState, type TreeState } from '../vault/fileTree';
import type { StoreContext } from './context';

export interface TreeSlice {
  /** The vault's folders as loaded so far. Folders load when first opened. */
  tree: TreeState;

  /** Opens or closes a folder in the tree, loading it the first time. */
  toggleFolder: (path: string) => Promise<void>;
  /** Opens a folder and every folder above it. */
  revealFolder: (path: string) => Promise<void>;
  selectEntry: (path: string | null) => void;
  /** Reloads the root and every open folder from disk. */
  refreshTree: () => Promise<void>;
  /** Reloads these folders if they are loaded (others load when opened). */
  reloadFolders: (paths: readonly string[]) => Promise<void>;
}

/** Reads a folder's own settings and the colours of the folders inside it. */
async function readMeta(
  ctx: StoreContext,
  path: string,
  entries: readonly DirEntry[],
): Promise<{ meta?: SectionMeta; childColours: Record<string, string> }> {
  const own = entries.some((e) => e.name === SECTION_FILE)
    ? await readSectionMeta(ctx.platform, path).catch(() => null)
    : null;
  const childColours: Record<string, string> = {};
  await Promise.all(
    entries
      .filter((e) => e.isDir)
      .map(async (e) => {
        const meta = await readSectionMeta(ctx.platform, e.path).catch(() => null);
        if (meta?.colour) childColours[e.path] = meta.colour;
      }),
  );
  return own ? { meta: own, childColours } : { childColours };
}

/** The folders whose listing or colours a change at `path` affects. */
function foldersAffectedBy(path: string): string[] {
  const parent = parentVaultPath(path) ?? '';
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (name === SECTION_FILE) {
    // A folder's own settings, and its colour as shown in its parent.
    return [parent, parentVaultPath(parent) ?? ''];
  }
  return [parent, path];
}

export function createTreeSlice(ctx: StoreContext): TreeSlice {
  const { platform, set, get } = ctx;
  let stopWatching: (() => void) | null = null;

  function setTree(update: (tree: TreeState) => TreeState): void {
    set({ tree: update(get().tree) });
  }

  function setFolder(path: string, state: FolderState): void {
    setTree((t) => ({ ...t, folders: { ...t.folders, [path]: state } }));
  }

  async function loadFolder(path: string): Promise<void> {
    const token = ctx.session();
    // Keep showing old contents while refreshing, to avoid a flash.
    if (get().tree.folders[path]?.status !== 'loaded') setFolder(path, { status: 'loading' });

    let next: FolderState | 'gone';
    try {
      const entries = visibleEntries(await platform.listDir(path));
      next = { status: 'loaded', entries, ...(await readMeta(ctx, path, entries)) };
    } catch (err) {
      const e = PlatformError.from(err);
      next =
        path !== '' && (e.kind === 'NotFound' || e.kind === 'NotADirectory')
          ? 'gone'
          : { status: 'error', message: `This folder could not be opened. ${e.message}` };
    }
    if (token !== ctx.session()) return;

    if (next === 'gone') {
      setTree((t) => {
        const folders = Object.fromEntries(Object.entries(t.folders).filter(([p]) => p !== path));
        return { ...t, folders, expanded: t.expanded.filter((p) => p !== path) };
      });
    } else {
      setFolder(path, next);
    }
  }

  async function reloadFolders(paths: readonly string[]): Promise<void> {
    const loaded = [...new Set(paths)].filter((p) => get().tree.folders[p] !== undefined);
    await Promise.all(loaded.map(loadFolder));
    clearStaleSelection();
  }

  /**
   * Clears the selection if it has gone. The nearest loaded folder above it
   * decides: if that folder no longer lists the next step down, it has gone.
   * Folders not loaded yet (just renamed, say) give no evidence either way.
   */
  function clearStaleSelection(): void {
    setTree((t) => {
      if (t.selected === null) return t;
      for (let p: string | null = t.selected; p !== null && p !== ''; p = parentVaultPath(p)) {
        const folder = t.folders[parentVaultPath(p) ?? ''];
        if (folder?.status !== 'loaded') continue;
        return folder.entries.some((e) => e.path === p) ? t : { ...t, selected: null };
      }
      return t;
    });
  }

  ctx.onVault({
    opened: async () => {
      set({ tree: emptyTree() });
      await loadFolder('');
      // Follow changes from File Explorer, sync tools and BenchWork itself.
      stopWatching = platform.watch((change) => {
        void reloadFolders(change.paths.flatMap(foldersAffectedBy));
      });
    },
    closing: () => {
      stopWatching?.();
      stopWatching = null;
    },
    closed: () => {
      set({ tree: emptyTree() });
    },
  });

  return {
    tree: emptyTree(),

    toggleFolder: async (path) => {
      if (get().status.kind !== 'open') return;
      if (get().tree.expanded.includes(path)) {
        setTree((t) => ({ ...t, expanded: t.expanded.filter((p) => p !== path) }));
        return;
      }
      setTree((t) => ({ ...t, expanded: [...t.expanded, path] }));
      if (get().tree.folders[path]?.status !== 'loaded') await loadFolder(path);
    },

    revealFolder: async (path) => {
      if (get().status.kind !== 'open' || path === '') return;
      const chain: string[] = [];
      for (let p: string | null = path; p !== null && p !== ''; p = parentVaultPath(p)) {
        chain.unshift(p);
      }
      for (const folder of chain) {
        if (!get().tree.expanded.includes(folder)) {
          setTree((t) => ({ ...t, expanded: [...t.expanded, folder] }));
        }
        if (get().tree.folders[folder]?.status !== 'loaded') await loadFolder(folder);
      }
    },

    selectEntry: (path) => {
      setTree((t) => ({ ...t, selected: path }));
    },

    refreshTree: async () => {
      if (get().status.kind !== 'open') return;
      await Promise.all(['', ...get().tree.expanded].map(loadFolder));
      clearStaleSelection();
    },

    reloadFolders,
  };
}

/** Rewrites paths under `from` to sit under `to`, after a rename or move. */
export function rebasePath(path: string, from: string, to: string): string {
  if (path === from) return to;
  return path.startsWith(`${from}/`) ? joinVaultPath(to, path.slice(from.length + 1)) : path;
}
