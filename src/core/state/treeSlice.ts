import { PlatformError } from '../platform';
import { emptyTree, visibleEntries, type FolderState, type TreeState } from '../vault/fileTree';
import type { StoreContext } from './context';

export interface TreeSlice {
  /** The file tree of the open vault. Folders load when first opened. */
  tree: TreeState;

  /** Opens or closes a folder in the tree, loading it the first time. */
  toggleFolder: (path: string) => Promise<void>;
  selectEntry: (path: string) => void;
  /** Reloads the root and every open folder from disk. */
  refreshTree: () => Promise<void>;
}

export function createTreeSlice(ctx: StoreContext): TreeSlice {
  const { platform, set, get } = ctx;

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
      next = { status: 'loaded', entries: visibleEntries(await platform.listDir(path)) };
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

  ctx.onVault({
    opened: async () => {
      set({ tree: emptyTree() });
      await loadFolder('');
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

    selectEntry: (path) => {
      setTree((t) => ({ ...t, selected: path }));
    },

    refreshTree: async () => {
      if (get().status.kind !== 'open') return;
      await Promise.all(['', ...get().tree.expanded].map(loadFolder));
      // Clear the selection if the selected item has gone.
      setTree((t) => {
        if (t.selected === null) return t;
        const listed = Object.values(t.folders).some(
          (f) => f.status === 'loaded' && f.entries.some((e) => e.path === t.selected),
        );
        return listed ? t : { ...t, selected: null };
      });
    },
  };
}
