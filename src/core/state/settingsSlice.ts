import { saveAppSettings, type Theme } from '../settings/appSettings';
import { describeError, type StoreContext } from './context';

export type View = 'files' | 'settings';

/** Limits for the copy-or-link threshold, in MB. */
export const LINK_THRESHOLD_RANGE = { min: 1, max: 100_000 } as const;

export interface SettingsSlice {
  /** What the main area shows while a vault is open. */
  view: View;
  /** Why the last settings change could not be saved. */
  settingsError: string | null;

  showView: (view: View) => void;
  /** Per-device; saved in the app settings, not the vault. */
  setTheme: (theme: Theme) => Promise<void>;
  /** Per-device: show every file in the sidebar, not just pages. */
  setShowAllFiles: (show: boolean) => Promise<void>;
  /** Per-vault; saved in .benchwork/config.json. */
  setLinkThreshold: (mb: number) => Promise<void>;
}

export function createSettingsSlice(ctx: StoreContext): SettingsSlice {
  const { platform, set, get } = ctx;

  ctx.onVault({
    opened: () => {
      set({ view: 'files', settingsError: null });
    },
    closed: () => {
      set({ view: 'files', settingsError: null });
    },
  });

  return {
    view: 'files',
    settingsError: null,

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

    setShowAllFiles: async (showAllFiles) => {
      const settings = { ...get().settings, showAllFiles };
      set({ settings, settingsError: null });
      try {
        await saveAppSettings(platform, settings);
      } catch (err) {
        set({ settingsError: `The setting could not be saved. ${describeError(err)}` });
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
        await ctx.updateConfig((c) => ({
          ...c,
          attachments: { ...c.attachments, linkThresholdMB: mb },
        }));
      } catch (err) {
        set({ settingsError: `The vault settings could not be saved. ${describeError(err)}` });
      }
    },
  };
}
