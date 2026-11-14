import { defaultAppearance, type Appearance } from '../settings/appearance';
import {
  programName,
  saveAppSettings,
  type ProgramShortcut,
  type Theme,
} from '../settings/appSettings';
import type { PageLayout } from '../vault/vaultConfig';
import { describeError, type StoreContext } from './context';
import { APP_VERSION, BUILD_ID, DOWNLOADS_URL, type FeedbackEnvironment } from '../feedback/report';

/** What the main area shows: pages, Settings, or pages that differ between devices. */
export type View = 'files' | 'settings' | 'conflicts';

/** Limits for the copy-or-link threshold, in MB. */
export const LINK_THRESHOLD_RANGE = { min: 1, max: 100_000 } as const;

export interface SettingsSlice {
  feedbackOpen: boolean;
  feedbackEnvironment: FeedbackEnvironment;
  setFeedbackOpen: (open: boolean) => void;
  setPreviewBarVisible: (visible: boolean) => Promise<void>;
  openLatestInstaller: () => Promise<void>;
  openFeedbackEmail: (subject: string, body: string) => Promise<void>;
  /** What the main area shows while a vault is open. */
  view: View;
  /** Why the last settings change could not be saved. */
  settingsError: string | null;

  showView: (view: View) => Promise<void>;
  /** The Settings tab to show when Settings next opens, such as `modules`. */
  settingsTab: string | null;
  /** Opens Settings, at a tab if given. */
  openSettings: (tab?: string) => Promise<void>;
  /** Per-device; saved in the app settings, not the vault. */
  setTheme: (theme: Theme) => Promise<void>;
  /** Per-device: changes some of the appearance, keeping the rest. */
  setAppearance: (changes: Partial<Appearance>) => Promise<void>;
  /** Per-device: back to a preset's own look. */
  resetAppearance: () => Promise<void>;
  /** Per-device: opens or folds a module's panel in the sidebar. */
  togglePanel: (id: string) => Promise<void>;
  /** Per-device: the programs with a shortcut on Home. */
  setPrograms: (programs: ProgramShortcut[]) => Promise<void>;
  /** Asks for a program on this computer and adds it to Home. */
  addProgram: () => Promise<void>;
  /** Starts a program from Home; says why if it cannot. */
  launchProgram: (program: ProgramShortcut) => Promise<void>;
  /** Whether this device can start programs. */
  canLaunch: () => boolean;
  /** Per-device: show every file in the sidebar, not just pages. */
  setShowAllFiles: (show: boolean) => Promise<void>;
  /** Per-vault; saved in .benchwork/config.json. */
  setLinkThreshold: (mb: number) => Promise<void>;
  /** Per-vault: the layout new pages start with. */
  setNewPageLayout: (layout: PageLayout) => Promise<void>;
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
    feedbackOpen: false,
    feedbackEnvironment: { version: APP_VERSION, build: BUILD_ID, device: platform.kind },
    setFeedbackOpen: (feedbackOpen) => {
      set({ feedbackOpen });
    },
    setPreviewBarVisible: async (previewBarVisible) => {
      const settings = { ...get().settings, previewBarVisible };
      set({ settings, settingsError: null });
      try {
        await saveAppSettings(platform, settings);
      } catch (err) {
        set({ settingsError: `This preference could not be saved. ${describeError(err)}` });
      }
    },
    openLatestInstaller: () => platform.openWebLink(DOWNLOADS_URL),
    openFeedbackEmail: async (subject, body) => {
      if (!platform.openFeedbackEmail)
        throw new Error('Copy the report and send it using your email app.');
      await platform.openFeedbackEmail(subject, body);
    },
    view: 'files',
    settingsError: null,
    settingsTab: null,

    openSettings: async (tab) => {
      if (get().status.kind !== 'open') return;
      if (get().editorSaves.length > 0 && !(await get().saveEditors())) return;
      set({ view: 'settings', settingsTab: tab ?? null });
    },

    showView: async (view) => {
      if (view !== get().view && get().editorSaves.length > 0 && !(await get().saveEditors()))
        return;
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

    setAppearance: async (changes) => {
      const settings = {
        ...get().settings,
        appearance: { ...get().settings.appearance, ...changes },
      };
      set({ settings, settingsError: null });
      try {
        await saveAppSettings(platform, settings);
      } catch (err) {
        set({ settingsError: `The appearance could not be saved. ${describeError(err)}` });
      }
    },

    resetAppearance: async () => {
      await get().setAppearance(defaultAppearance(get().settings.appearance.preset));
    },

    setPrograms: async (programs) => {
      const settings = { ...get().settings, programs };
      set({ settings, settingsError: null });
      try {
        await saveAppSettings(platform, settings);
      } catch (err) {
        set({ settingsError: `Your programs could not be saved. ${describeError(err)}` });
      }
    },

    addProgram: async () => {
      const picked = await platform.pickFiles({ title: 'Choose a program', multiple: true });
      const have = new Set(get().settings.programs.map((p) => p.path.toLowerCase()));
      const fresh = picked.filter((p) => /\.(exe|lnk|url)$/i.test(p) && !have.has(p.toLowerCase()));
      if (
        picked.length > 0 &&
        fresh.length === 0 &&
        !picked.some((p) => have.has(p.toLowerCase()))
      ) {
        set({ settingsError: 'Choose a program (.exe) or a shortcut to one.' });
        return;
      }
      if (fresh.length === 0) return;
      await get().setPrograms([
        ...get().settings.programs,
        ...fresh.map((path) => ({ name: programName(path), path })),
      ]);
    },

    launchProgram: async (program) => {
      if (platform.launchProgram === null) return;
      try {
        await platform.launchProgram(program.path);
        set({ settingsError: null });
      } catch (err) {
        set({ settingsError: `${program.name} could not be opened. ${describeError(err)}` });
      }
    },

    canLaunch: () => platform.launchProgram !== null,

    togglePanel: async (id) => {
      const open = get().settings.openPanels;
      const openPanels = open.includes(id) ? open.filter((p) => p !== id) : [...open, id];
      const settings = { ...get().settings, openPanels };
      set({ settings });
      try {
        await saveAppSettings(platform, settings);
      } catch (err) {
        set({ settingsError: `The setting could not be saved. ${describeError(err)}` });
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

    setNewPageLayout: async (layout) => {
      set({ settingsError: null });
      try {
        await ctx.updateConfig((c) => ({ ...c, pages: { ...c.pages, layout } }));
      } catch (err) {
        set({ settingsError: `The vault settings could not be saved. ${describeError(err)}` });
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
