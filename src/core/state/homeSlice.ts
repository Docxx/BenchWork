import type { CalendarMark } from '../api';
import { dayOfPath } from '../pages/daily';
import type { PageRef } from '../platform';
import { defaultHomeLayout, saveAppSettings, type HomeLayout } from '../settings/appSettings';
import {
  closeWidget,
  dockContents,
  LEFT_SIZE,
  placeWidget,
  RIGHT_SPLIT,
  type DockPlace,
  type Placeable,
} from '../settings/layout';
import { describeError, type StoreContext } from './context';

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
  /** Puts a widget in a dock, at `index` or the end, out of wherever it was. */
  placeWidget: (
    widgets: readonly Placeable[],
    id: string,
    to: DockPlace,
    index?: number,
  ) => Promise<void>;
  /** Takes a widget out of the docks. */
  closeWidget: (id: string) => Promise<void>;
  /** Puts a widget on Home, as a card. */
  addToHome: (id: string) => Promise<void>;
  /** The left dock's height in pixels, or the right top dock's share. */
  setDockSize: (changes: { leftSize?: number; rightSplit?: number }) => Promise<void>;
  /**
   * What the calendar shows from `from` to `to` (both `YYYY-MM-DD`): daily
   * pages, then marks from modules. A module that fails is left out.
   */
  calendarMarks: (from: string, to: string) => Promise<CalendarMark[]>;
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

    placeWidget: async (widgets, id, to, index) => {
      const { docks } = get().homeLayout();
      await get().setHomeLayout({
        docks: placeWidget(docks, dockContents(docks, widgets), id, to, index),
      });
    },

    closeWidget: async (id) => {
      await get().setHomeLayout({ docks: closeWidget(get().homeLayout().docks, id) });
    },

    addToHome: async (id) => {
      const layout = get().homeLayout();
      await get().setHomeLayout({
        added: layout.added.includes(id) ? layout.added : [...layout.added, id],
        hidden: layout.hidden.filter((h) => h !== id),
      });
    },

    setDockSize: async ({ leftSize, rightSplit }) => {
      const { docks } = get().homeLayout();
      const clamp = (n: number, r: { min: number; max: number }) =>
        Math.min(r.max, Math.max(r.min, n));
      await get().setHomeLayout({
        docks: {
          ...docks,
          ...(leftSize === undefined ? {} : { leftSize: Math.round(clamp(leftSize, LEFT_SIZE)) }),
          ...(rightSplit === undefined ? {} : { rightSplit: clamp(rightSplit, RIGHT_SPLIT) }),
        },
      });
    },

    calendarMarks: async (from, to) => {
      if (get().status.kind !== 'open') return [];
      let days: CalendarMark[] = [];
      try {
        await get().indexIdle();
        days = (await platform.index.pages()).flatMap((p) => {
          const day = dayOfPath(p.path);
          return day !== null && day >= from && day <= to
            ? [{ date: day, title: 'Daily page', path: p.path, colour: 'green' }]
            : [];
        });
      } catch {
        // The index is not ready: no daily pages yet.
      }
      const fromModules = await Promise.all(
        get().calendarSources.map((s) => s.marks(from, to).catch(() => [])),
      );
      return [...days, ...fromModules.flat()];
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
