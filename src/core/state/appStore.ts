import { createStore, type StoreApi } from 'zustand/vanilla';
import { createContributions } from '../modules/contributions';
import { ModuleRegistry } from '../modules/registry';
import { PlatformError, type PlatformAdapter } from '../platform';
import {
  defaultAppSettings,
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
} from '../settings/appSettings';
import { emptyTree, visibleEntries, type FolderState, type TreeState } from '../vault/fileTree';
import { VaultConfigError } from '../vault/vaultConfig';
import {
  checkFolder,
  initialiseVault,
  loadVaultConfig,
  type OpenVault,
} from '../vault/vaultService';

export type VaultStatus =
  | { kind: 'starting' }
  | { kind: 'no-vault' }
  /** The chosen folder has other files; waiting for the user to agree. */
  | { kind: 'confirm-folder'; root: string }
  | { kind: 'open'; vault: OpenVault };

export type PickMode = 'new' | 'open';

export interface AppState {
  status: VaultStatus;
  settings: AppSettings;
  /** True while a vault action is running, to ignore repeat clicks. */
  busy: boolean;
  /** A message for the vault picker, such as why a folder could not open. */
  notice: string | null;
  /** The file tree of the open vault. Folders load when first opened. */
  tree: TreeState;

  start: () => Promise<void>;
  chooseFolder: (mode: PickMode) => Promise<void>;
  confirmFolder: () => Promise<void>;
  cancelFolder: () => void;
  /**
   * Stops all modules, closes the vault and returns to the picker. The last
   * vault is still remembered.
   */
  closeVault: () => Promise<void>;

  /** Opens or closes a folder in the tree, loading it the first time. */
  toggleFolder: (path: string) => Promise<void>;
  selectEntry: (path: string) => void;
  /** Reloads the root and every open folder from disk. */
  refreshTree: () => Promise<void>;
}

export type AppStore = StoreApi<AppState>;

const PICK_TITLES: Record<PickMode, string> = {
  new: 'Choose a folder for the new vault',
  open: 'Open a vault folder',
};

export function describeError(err: unknown): string {
  if (err instanceof VaultConfigError)
    return `The vault settings could not be read. ${err.message}`;
  const e = PlatformError.from(err);
  switch (e.kind) {
    case 'NotFound':
      return 'That folder could not be found.';
    case 'NotADirectory':
      return 'That is a file, not a folder.';
    default:
      return `Something went wrong: ${e.message}`;
  }
}

/**
 * @param registry the app's modules. Tests may leave it out for a registry
 *   with no modules.
 */
export function createAppStore(
  platform: PlatformAdapter,
  registry: ModuleRegistry = new ModuleRegistry([], [], {
    platform,
    device: platform.kind,
    contributions: createContributions(),
  }),
): AppStore {
  return createStore<AppState>()((set, get) => {
    /**
     * Bumped whenever a vault opens or closes, so a folder listing that
     * finishes after the user has switched vault is thrown away.
     */
    let session = 0;

    function setTree(update: (tree: TreeState) => TreeState): void {
      set({ tree: update(get().tree) });
    }

    function setFolder(path: string, state: FolderState): void {
      setTree((t) => ({ ...t, folders: { ...t.folders, [path]: state } }));
    }

    async function loadFolder(path: string): Promise<void> {
      const token = session;
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
      if (token !== session) return;

      if (next === 'gone') {
        setTree((t) => {
          const folders = Object.fromEntries(Object.entries(t.folders).filter(([p]) => p !== path));
          return { ...t, folders, expanded: t.expanded.filter((p) => p !== path) };
        });
      } else {
        setFolder(path, next);
      }
    }

    /** Runs a vault action unless one is already running. */
    async function guarded(action: () => Promise<void>): Promise<void> {
      if (get().busy) return;
      set({ busy: true });
      try {
        await action();
      } catch (err) {
        set({ status: { kind: 'no-vault' }, notice: describeError(err) });
      } finally {
        set({ busy: false });
      }
    }

    /** Sets up and opens the folder the platform currently points at. */
    async function openCurrent(root: string): Promise<void> {
      await initialiseVault(platform);
      const config = await loadVaultConfig(platform);
      session += 1;
      set({ status: { kind: 'open', vault: { root, config } }, notice: null, tree: emptyTree() });
      await loadFolder('');
      await registry.activateFromConfig(config);

      const settings = { ...get().settings, lastVault: root };
      set({ settings });
      try {
        await saveAppSettings(platform, settings);
      } catch {
        // Not remembering the vault is an inconvenience, not a failure.
      }
    }

    return {
      status: { kind: 'starting' },
      settings: defaultAppSettings(),
      busy: false,
      notice: null,
      tree: emptyTree(),

      start: () =>
        guarded(async () => {
          const settings = await loadAppSettings(platform);
          set({ settings });
          const last = settings.lastVault;
          if (last === null) {
            set({ status: { kind: 'no-vault' } });
            return;
          }
          let check;
          try {
            check = await checkFolder(platform, last);
          } catch {
            set({
              status: { kind: 'no-vault' },
              notice: `Your last vault could not be found: ${last}`,
            });
            return;
          }
          if (check.kind === 'vault') {
            await openCurrent(check.root);
          } else {
            set({
              status: { kind: 'no-vault' },
              notice: `Your last vault is no longer set up as a vault: ${last}`,
            });
          }
        }),

      chooseFolder: (mode) =>
        guarded(async () => {
          const picked = await platform.pickFolder({ title: PICK_TITLES[mode] });
          if (picked === null) return;
          const check = await checkFolder(platform, picked);
          if (check.kind === 'folder') {
            set({ status: { kind: 'confirm-folder', root: check.root }, notice: null });
          } else {
            await openCurrent(check.root);
          }
        }),

      confirmFolder: () =>
        guarded(async () => {
          const status = get().status;
          if (status.kind !== 'confirm-folder') return;
          await openCurrent(status.root);
        }),

      cancelFolder: () => {
        if (get().status.kind === 'confirm-folder') set({ status: { kind: 'no-vault' } });
      },

      closeVault: () =>
        guarded(async () => {
          if (get().status.kind !== 'open') return;
          session += 1;
          // Modules finish with this vault before the platform can point at another.
          await registry.deactivateAll();
          set({ status: { kind: 'no-vault' }, notice: null, tree: emptyTree() });
        }),

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
  });
}
