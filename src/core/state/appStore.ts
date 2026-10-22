import { createStore, type StoreApi } from 'zustand/vanilla';
import { PlatformError, type PlatformAdapter } from '../platform';
import {
  defaultAppSettings,
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
} from '../settings/appSettings';
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

  start: () => Promise<void>;
  chooseFolder: (mode: PickMode) => Promise<void>;
  confirmFolder: () => Promise<void>;
  cancelFolder: () => void;
  /** Closes the vault and returns to the picker. The last vault is still remembered. */
  closeVault: () => void;
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

export function createAppStore(platform: PlatformAdapter): AppStore {
  return createStore<AppState>()((set, get) => {
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
      set({ status: { kind: 'open', vault: { root, config } }, notice: null });

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

      closeVault: () => {
        if (get().status.kind === 'open') set({ status: { kind: 'no-vault' }, notice: null });
      },
    };
  });
}
