import type { AvailableUpdate } from '../platform/types';
import { saveAppSettings } from '../settings/appSettings';
import { describeError, type StoreContext } from './context';

export interface UpdatesSlice {
  appUpdate: {
    available: AvailableUpdate | null;
    phase: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing';
    progress: number;
    error: string;
    message: string;
    checked: boolean;
    dismissed: boolean;
  };
  checkAppUpdates: () => Promise<void>;
  downloadAppUpdate: () => Promise<void>;
  installAppUpdate: () => Promise<void>;
  setUpdateChecks: (enabled: boolean) => Promise<void>;
  dismissAppUpdate: () => void;
  initAppUpdates: () => void;
  canUpdateApp: boolean;
}
export function createUpdatesSlice(ctx: StoreContext): UpdatesSlice {
  const { platform, get, set } = ctx;
  const native = platform.updates;
  const patch = (value: Partial<UpdatesSlice['appUpdate']>) => {
    set((s) => ({ appUpdate: { ...s.appUpdate, ...value } }));
  };
  let initialised = false;
  const busy = () => ['checking', 'downloading', 'installing'].includes(get().appUpdate.phase);
  async function check() {
    if (!native || busy()) return;
    patch({ phase: 'checking', error: '', message: '' });
    try {
      const available = await native.check();
      patch({
        available,
        phase: available ? 'available' : 'idle',
        checked: true,
        dismissed: false,
      });
    } catch (error) {
      patch({
        phase: get().appUpdate.available ? 'available' : 'idle',
        error: describeError(error),
      });
    }
  }
  return {
    canUpdateApp: !!native,
    appUpdate: {
      available: null,
      phase: 'idle',
      progress: 0,
      error: '',
      message: '',
      checked: false,
      dismissed: false,
    },
    checkAppUpdates: check,
    initAppUpdates: () => {
      if (initialised) return;
      initialised = true;
      if (get().settings.checkUpdatesOnStart) void check();
    },
    dismissAppUpdate: () => {
      patch({ dismissed: true });
    },
    setUpdateChecks: async (checkUpdatesOnStart) => {
      const settings = { ...get().settings, checkUpdatesOnStart };
      try {
        await saveAppSettings(platform, settings);
        set({ settings });
        if (checkUpdatesOnStart) void check();
      } catch (error) {
        patch({ error: `The update preference could not be saved. ${describeError(error)}` });
      }
    },
    downloadAppUpdate: async () => {
      const available = get().appUpdate.available;
      if (!native || !available || busy()) return;
      patch({ phase: 'downloading', progress: 0, error: '', message: '' });
      try {
        await native.download(available.version, (downloaded, total) => {
          patch({
            progress: total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0,
          });
        });
        patch({
          phase: 'ready',
          progress: 100,
          message: 'Update downloaded and verified. Install when you are ready.',
        });
      } catch (error) {
        patch({ phase: 'available', error: describeError(error) });
      }
    },
    installAppUpdate: async () => {
      if (!native || get().appUpdate.phase !== 'ready') return;
      patch({ phase: 'installing', error: '', message: '' });
      const status = get().status;
      const root = status.kind === 'open' ? status.vault.root : null;
      try {
        if (!(await native.prepareInstall())) {
          patch({
            phase: 'ready',
            message:
              'Allow updates from BenchWork in Android settings, then press Install update again.',
          });
          return;
        }
        if (!(await get().closeVault()))
          throw new Error(
            'Your work could not be saved. Resolve the save error before installing.',
          );
        await native.install();
        patch({
          phase: 'ready',
          message: 'Installer opened. Complete the update in the system window.',
        });
      } catch (error) {
        patch({ phase: 'ready', error: describeError(error) });
      }
      // Android can cancel installation. Keep its saved workspace available when
      // returning from the system screen. Windows exits after starting NSIS.
      if (root && platform.kind === 'tablet' && get().status.kind !== 'open')
        await get().switchToVault(root);
    },
  };
}
