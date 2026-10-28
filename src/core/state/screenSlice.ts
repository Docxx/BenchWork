import type { StoreContext } from './context';

/** What slides over the page on a compact screen. */
export type Drawer = 'sidebar' | 'panel';

export interface ScreenSlice {
  /**
   * A narrow window, such as a tablet held upright: the sidebar and side
   * panel slide over the page when wanted, rather than sitting beside it.
   */
  compact: boolean;
  setCompact: (compact: boolean) => void;
  /** Which one is over the page, on a compact screen. */
  drawer: Drawer | null;
  setDrawer: (drawer: Drawer | null) => void;
}

export function createScreenSlice(ctx: StoreContext): ScreenSlice {
  const { set, get } = ctx;
  return {
    compact: false,
    setCompact: (compact) => {
      if (get().compact !== compact) set({ compact, drawer: null });
    },
    drawer: null,
    setDrawer: (drawer) => {
      set({ drawer });
    },
  };
}
