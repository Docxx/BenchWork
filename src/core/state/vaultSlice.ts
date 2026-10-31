import {
  defaultAppSettings,
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
} from '../settings/appSettings';
import { createSampleNotebook } from '../vault/sampleNotebook';
import {
  checkFolder,
  initialiseVault,
  loadVaultConfig,
  type OpenVault,
} from '../vault/vaultService';
import type { FolderBrowser } from '../platform';
import { describeError, type StoreContext } from './context';

export type VaultStatus =
  | { kind: 'starting' }
  | { kind: 'no-vault' }
  /** The chosen folder has other files; waiting for the user to agree. */
  | { kind: 'confirm-folder'; root: string }
  /** The chosen folder is synced but nothing has arrived yet; waiting for the user to choose. */
  | { kind: 'confirm-syncing'; root: string }
  /** The chosen folder is inside the vault `owner`; waiting for the user to choose. */
  | { kind: 'confirm-nested'; folder: string; owner: string }
  /** Choosing a folder inside the app, where the system has no folder picker (Android). */
  | { kind: 'browse'; mode: PickMode }
  | { kind: 'open'; vault: OpenVault };

export type PickMode = 'new' | 'open';

export interface VaultSlice {
  status: VaultStatus;
  /** Per-device settings. The settings slice changes the theme; this slice owns lastVault. */
  settings: AppSettings;
  /** True while a vault action is running, to ignore repeat clicks. */
  busy: boolean;
  /** A message for the vault picker, such as why a folder could not open. */
  notice: string | null;

  start: () => Promise<void>;
  chooseFolder: (mode: PickMode) => Promise<void>;
  /** Folders by full path, where they are chosen inside the app; null elsewhere. */
  folderBrowser: FolderBrowser | null;
  /** For browse: use the folder chosen inside the app. */
  chooseBrowsedFolder: (path: string) => Promise<void>;
  confirmFolder: () => Promise<void>;
  /** For confirm-nested: open the vault the chosen folder is inside. */
  openOwnerVault: () => Promise<void>;
  /** For confirm-nested: set the chosen folder up as a vault of its own. */
  makeSeparateVault: () => Promise<void>;
  cancelFolder: () => void;
  /**
   * Lets every slice finish with the vault, closes it and returns to the
   * picker. The last vault is still remembered.
   */
  closeVault: () => Promise<void>;
  /** Closes the open vault and opens the one at `path`, such as a restored backup. */
  switchToVault: (path: string) => Promise<void>;
}

const PICK_TITLES: Record<PickMode, string> = {
  new: 'Choose a folder for the new vault',
  open: 'Open a vault folder',
};

export function createVaultSlice(ctx: StoreContext): VaultSlice {
  const { platform, set, get } = ctx;

  /** Goes on with a chosen folder: asks first if it has other files or is inside a vault. */
  async function goOnWith(picked: string): Promise<void> {
    const check = await checkFolder(platform, picked);
    if (check.kind === 'folder') {
      set({ status: { kind: 'confirm-folder', root: check.root }, notice: null });
    } else if (check.kind === 'awaiting-sync') {
      set({ status: { kind: 'confirm-syncing', root: check.root }, notice: null });
    } else if (check.kind === 'inside-vault') {
      set({
        status: { kind: 'confirm-nested', folder: check.root, owner: check.owner },
        notice: null,
      });
    } else {
      await openCurrent(check.root, check.kind === 'empty');
    }
  }

  /** Lets every slice finish with the open vault, then closes it. */
  async function closeOpen(): Promise<void> {
    if (get().status.kind !== 'open') return;
    // Everything finishes with this vault before the platform can point at another.
    await ctx.configSaved();
    for (const hooks of [...ctx.lifecycle].reverse()) await hooks.closing?.();
    ctx.bumpSession();
    set({ status: { kind: 'no-vault' }, notice: null });
    for (const hooks of ctx.lifecycle) hooks.closed?.();
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

  /**
   * Sets up and opens the folder the platform currently points at. A new
   * vault in an empty folder also gets the sample notebook.
   */
  async function openCurrent(root: string, empty = false): Promise<void> {
    await initialiseVault(platform);
    if (empty) await createSampleNotebook(platform);
    const config = await loadVaultConfig(platform);
    ctx.bumpSession();
    set({ status: { kind: 'open', vault: { root, config } }, notice: null });
    for (const hooks of ctx.lifecycle) await hooks.opened?.(config);
    // A vault just set up asks what it is for, to switch on the modules that suit.
    if (empty) set({ choosingPack: true });

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
    folderBrowser: platform.folderBrowser,
    settings: defaultAppSettings(),
    busy: false,
    notice: null,

    start: () =>
      guarded(async () => {
        const settings = await loadAppSettings(platform);
        set({ settings, guide: settings.guided ? null : 'welcome' });
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
          // Includes 'inside-vault': it was a vault before, so ask afresh rather than guess.
          set({
            status: { kind: 'no-vault' },
            notice: `Your last vault is no longer set up as a vault: ${last}`,
          });
        }
      }),

    chooseFolder: (mode) => {
      if (platform.folderBrowser !== null) {
        set({
          status: { kind: 'browse', mode },
          folderBrowser: platform.folderBrowser,
          notice: null,
        });
        return Promise.resolve();
      }
      return guarded(async () => {
        const picked = await platform.pickFolder({ title: PICK_TITLES[mode] });
        if (picked !== null) await goOnWith(picked);
      });
    },

    chooseBrowsedFolder: (path) =>
      guarded(async () => {
        if (get().status.kind === 'browse') await goOnWith(path);
      }),

    openOwnerVault: () =>
      guarded(async () => {
        const status = get().status;
        if (status.kind !== 'confirm-nested') return;
        await openCurrent(await platform.setVaultRoot(status.owner));
      }),

    makeSeparateVault: () =>
      guarded(async () => {
        const status = get().status;
        if (status.kind !== 'confirm-nested') return;
        await openCurrent(await platform.setVaultRoot(status.folder));
      }),

    confirmFolder: () =>
      guarded(async () => {
        const status = get().status;
        if (status.kind !== 'confirm-folder' && status.kind !== 'confirm-syncing') return;
        await openCurrent(status.root);
      }),

    cancelFolder: () => {
      const kind = get().status.kind;
      if (
        kind === 'confirm-folder' ||
        kind === 'confirm-syncing' ||
        kind === 'confirm-nested' ||
        kind === 'browse'
      ) {
        set({ status: { kind: 'no-vault' } });
      }
    },

    closeVault: () => guarded(closeOpen),

    switchToVault: (path) =>
      guarded(async () => {
        await closeOpen();
        await goOnWith(path);
      }),
  };
}
