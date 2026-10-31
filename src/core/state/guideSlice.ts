import { saveAppSettings } from '../settings/appSettings';
import { describeError, type StoreContext } from './context';

/** The first-run guide's steps, in order. */
export const GUIDE_STEPS = ['welcome', 'how', 'vault', 'modules', 'theme', 'tour'] as const;
export type GuideStep = (typeof GUIDE_STEPS)[number];

export interface GuideSlice {
  /** The guide's step on screen; null when it is not showing. */
  guide: GuideStep | null;
  /** Starts the guide from the beginning, such as from Settings. */
  startGuide: () => void;
  setGuideStep: (step: GuideStep) => void;
  /** Finished or skipped: it does not show again by itself on this device. */
  endGuide: () => Promise<void>;
}

export function createGuideSlice(ctx: StoreContext): GuideSlice {
  const { platform, set, get } = ctx;
  return {
    guide: null,

    startGuide: () => {
      set({ guide: 'welcome', choosingPack: false });
    },

    setGuideStep: (step) => {
      set({ guide: step });
    },

    endGuide: async () => {
      const settings = { ...get().settings, guided: true };
      // The guide offers the packs itself, so the pack question is not asked as well.
      set({ guide: null, choosingPack: false, settings });
      try {
        await saveAppSettings(platform, settings);
      } catch (err) {
        set({ settingsError: `Your settings could not be saved. ${describeError(err)}` });
      }
    },
  };
}
