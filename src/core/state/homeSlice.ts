import type { PageRef } from '../platform';
import { defaultHomeLayout, saveAppSettings, type HomeLayout } from '../settings/appSettings';
import { describeError, type StoreContext } from './context';

/** Cards that come with the app, in their usual order. Module cards follow them. */
export const BUILT_IN_CARDS = ['home.today', 'home.tools', 'home.pinned', 'home.recent'] as const;

/** All cards in the order Home shows them: the layout's order first, then the rest as usual. */
export function orderCards(available: readonly string[], layout: HomeLayout): string[] {
  const known = new Set(available);
  const ordered = layout.order.filter((id) => known.has(id));
  const placed = new Set(ordered);
  return [...ordered, ...available.filter((id) => !placed.has(id))];
}

/** The order after moving one card a place up (-1) or down (1). */
export function moveCard(order: readonly string[], id: string, by: -1 | 1): string[] {
  const next = [...order];
  const from = next.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= next.length) return next;
  [next[from], next[to]] = [next[to] as string, next[from] as string];
  return next;
}

/** Pages, newest change first; records and pages without a time are left out. */
export function recentPages(pages: readonly PageRef[], limit: number): PageRef[] {
  return pages
    .filter((p) => p.path.toLowerCase().endsWith('.md') && typeof p.mtime === 'number')
    .sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))
    .slice(0, limit);
}

export interface HomeSlice {
  /** Whether Home is showing: no page, file, view or Settings open. */
  atHome: () => boolean;
  /** Closes whatever is open and shows Home. */
  goHome: () => Promise<void>;
  /** The open vault's Home layout on this device. */
  homeLayout: () => HomeLayout;
  setHomeLayout: (changes: Partial<HomeLayout>) => Promise<void>;
  /** Pins a page to Home, or unpins it. */
  setPinned: (path: string, pinned: boolean) => Promise<void>;
  /** Pages changed most recently, newest first; empty while the index is not ready. */
  recentPages: (limit: number) => Promise<PageRef[]>;
}

export function createHomeSlice(ctx: StoreContext): HomeSlice {
  const { platform, set, get } = ctx;

  const vaultRoot = (): string | null => {
    const status = get().status;
    return status.kind === 'open' ? status.vault.root : null;
  };

  return {
    atHome: () => {
      const s = get();
      return (
        s.status.kind === 'open' &&
        s.view === 'files' &&
        s.page === null &&
        s.openFile === null &&
        s.moduleView === null
      );
    },

    goHome: async () => {
      if (get().status.kind !== 'open') return;
      get().showView('files');
      await get().closePage();
      set({ openFile: null, moduleView: null });
    },

    homeLayout: () => {
      const root = vaultRoot();
      return (root !== null ? get().settings.home[root] : undefined) ?? defaultHomeLayout();
    },

    setHomeLayout: async (changes) => {
      const root = vaultRoot();
      if (root === null) return;
      const layout = { ...get().homeLayout(), ...changes };
      const settings = { ...get().settings, home: { ...get().settings.home, [root]: layout } };
      set({ settings, settingsError: null });
      try {
        await saveAppSettings(platform, settings);
      } catch (err) {
        set({ settingsError: `Home could not be saved. ${describeError(err)}` });
      }
    },

    setPinned: async (path, pinned) => {
      const current = get()
        .homeLayout()
        .pinned.filter((p) => p !== path);
      await get().setHomeLayout({ pinned: pinned ? [...current, path] : current });
    },

    recentPages: async (limit) => {
      if (get().status.kind !== 'open') return [];
      try {
        await get().indexIdle();
        return recentPages(await platform.index.pages(), limit);
      } catch {
        // The index is still opening, or is being rebuilt: nothing to show yet.
        return [];
      }
    },
  };
}
