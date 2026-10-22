import { createStore, type StoreApi } from 'zustand/vanilla';
import { createContributions } from '../modules/contributions';
import { ModuleRegistry, type RegistryState } from '../modules/registry';
import { PlatformError, type PlatformAdapter } from '../platform';
import {
  defaultAppSettings,
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
  type Theme,
} from '../settings/appSettings';
import { emptyTree, visibleEntries, type FolderState, type TreeState } from '../vault/fileTree';
import { VaultConfigError, type VaultConfig } from '../vault/vaultConfig';
import {
  checkFolder,
  initialiseVault,
  loadVaultConfig,
  saveVaultConfig,
  type OpenVault,
} from '../vault/vaultService';

export type VaultStatus =
  | { kind: 'starting' }
  | { kind: 'no-vault' }
  /** The chosen folder has other files; waiting for the user to agree. */
  | { kind: 'confirm-folder'; root: string }
  | { kind: 'open'; vault: OpenVault };

export type PickMode = 'new' | 'open';

export type View = 'files' | 'settings';

/** Limits for the copy-or-link threshold, in MB. */
export const LINK_THRESHOLD_RANGE = { min: 1, max: 100_000 } as const;

/** A module change that also switches other modules, waiting for the user to agree. */
export interface PendingModuleChange {
  id: string;
  enable: boolean;
  /** Every module that would change, in the order they would change. */
  ids: string[];
}

export interface AppState {
  status: VaultStatus;
  settings: AppSettings;
  /** True while a vault action is running, to ignore repeat clicks. */
  busy: boolean;
  /** A message for the vault picker, such as why a folder could not open. */
  notice: string | null;
  /** The file tree of the open vault. Folders load when first opened. */
  tree: TreeState;
  /** What the main area shows while a vault is open. */
  view: View;
  /** Why the last settings change could not be saved. */
  settingsError: string | null;
  /** Every module and whether it is on, mirrored from the registry. */
  modules: RegistryState;
  pendingModuleChange: PendingModuleChange | null;
  /** Why the last module change could not be made. */
  moduleNotice: string | null;
  moduleBusy: boolean;

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

  showView: (view: View) => void;
  /** Per-device; saved in the app settings, not the vault. */
  setTheme: (theme: Theme) => Promise<void>;
  /** Per-vault; saved in .benchwork/config.json. */
  setLinkThreshold: (mb: number) => Promise<void>;
  /**
   * Switches a module on or off and saves that in the vault config. If other
   * modules would have to change too, sets pendingModuleChange instead and
   * waits for confirmModuleChange.
   */
  setModuleEnabled: (id: string, enable: boolean) => Promise<void>;
  confirmModuleChange: () => Promise<void>;
  cancelModuleChange: () => void;
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
  const store = createStore<AppState>()((set, get) => {
    /**
     * Bumped whenever a vault opens or closes, so a folder listing that
     * finishes after the user has switched vault is thrown away.
     */
    let session = 0;

    /** Config writes, one at a time. Closing a vault waits for them. */
    let configSaves: Promise<void> = Promise.resolve();

    /**
     * Changes the open vault's config in memory and queues a save. The save
     * writes whatever is newest when its turn comes, and is skipped if the
     * vault has closed, so it can never land in a different vault.
     */
    function updateConfig(change: (config: VaultConfig) => VaultConfig): Promise<void> {
      const status = get().status;
      if (status.kind !== 'open') return Promise.resolve();
      const config = change(status.vault.config);
      set({ status: { kind: 'open', vault: { ...status.vault, config } } });

      const token = session;
      const save = configSaves.then(async () => {
        const current = get().status;
        if (token !== session || current.kind !== 'open') return;
        await saveVaultConfig(platform, current.vault.config);
      });
      configSaves = save.catch(() => undefined);
      return save;
    }

    async function applyModuleChange(enable: boolean, ids: readonly string[]): Promise<void> {
      set({ moduleBusy: true, moduleNotice: null, pendingModuleChange: null });
      try {
        await (enable ? registry.enable(ids) : registry.disable(ids));
        await updateConfig((c) => {
          const modules = { ...c.modules };
          for (const id of ids) modules[id] = { ...modules[id], enabled: enable };
          return { ...c, modules };
        });
      } catch (err) {
        set({ moduleNotice: `The change could not be saved. ${describeError(err)}` });
      } finally {
        set({ moduleBusy: false });
      }
    }

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
      set({
        status: { kind: 'open', vault: { root, config } },
        notice: null,
        tree: emptyTree(),
        view: 'files',
      });
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
      view: 'files',
      settingsError: null,
      modules: registry.store.getState(),
      pendingModuleChange: null,
      moduleNotice: null,
      moduleBusy: false,

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
          // Settings and modules finish with this vault before the platform
          // can point at another.
          await configSaves;
          session += 1;
          await registry.deactivateAll();
          set({
            status: { kind: 'no-vault' },
            notice: null,
            tree: emptyTree(),
            view: 'files',
            settingsError: null,
            pendingModuleChange: null,
            moduleNotice: null,
          });
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

      showView: (view) => {
        if (get().status.kind === 'open') set({ view });
      },

      setTheme: async (theme) => {
        const settings = { ...get().settings, theme };
        set({ settings, settingsError: null });
        try {
          await saveAppSettings(platform, settings);
        } catch (err) {
          set({ settingsError: `The theme could not be saved. ${describeError(err)}` });
        }
      },

      setLinkThreshold: async (mb) => {
        const { min, max } = LINK_THRESHOLD_RANGE;
        if (!Number.isInteger(mb) || mb < min || mb > max) {
          set({ settingsError: `Enter a whole number from ${String(min)} to ${String(max)}.` });
          return;
        }
        set({ settingsError: null });
        try {
          await updateConfig((c) => ({
            ...c,
            attachments: { ...c.attachments, linkThresholdMB: mb },
          }));
        } catch (err) {
          set({ settingsError: `The vault settings could not be saved. ${describeError(err)}` });
        }
      },

      setModuleEnabled: async (id, enable) => {
        if (get().status.kind !== 'open' || get().moduleBusy) return;
        const plan = enable ? registry.planEnable(id) : registry.planDisable(id);
        if (!plan.ok) {
          set({ moduleNotice: plan.reason, pendingModuleChange: null });
          return;
        }
        if (plan.ids.length === 0) return;
        if (plan.ids.some((other) => other !== id)) {
          set({ pendingModuleChange: { id, enable, ids: plan.ids }, moduleNotice: null });
          return;
        }
        await applyModuleChange(enable, plan.ids);
      },

      confirmModuleChange: async () => {
        const pending = get().pendingModuleChange;
        if (!pending || get().moduleBusy) return;
        await applyModuleChange(pending.enable, pending.ids);
      },

      cancelModuleChange: () => {
        set({ pendingModuleChange: null });
      },
    };
  });

  registry.store.subscribe((modules) => {
    store.setState({ modules });
  });
  return store;
}
