import { createPage, NameError, withLayout } from '../notebooks/notebookService';
import { pageTitle } from '../notebooks/notebookTree';
import {
  dailyPath,
  dateOf,
  dayHeading,
  dayOf,
  dayOfPath,
  findDay,
  listDays,
  neighbourDay,
  type Day,
} from '../pages/daily';
import { localTimestamp } from '../pages/frontmatter';
import {
  DAILY_TEMPLATE,
  listTemplates,
  pageFromTemplate,
  saveAsTemplate,
  templateBody,
  type TemplateRef,
} from '../pages/templates';
import { baseName, parentVaultPath, PlatformError } from '../platform';
import type { StoreContext } from './context';

/** The daily pages before and after the open one, as paths. */
export interface DayNeighbours {
  previous: string | null;
  next: string | null;
}

const NO_NEIGHBOURS: DayNeighbours = { previous: null, next: null };

export interface DailySlice {
  /** Set when the open page is a daily page. */
  dayNeighbours: DayNeighbours;
  templates: TemplateRef[];

  /** Opens today's page, creating it first if needed. */
  openToday: (now?: Date) => Promise<void>;
  /** Opens a day's page, creating it first if needed. */
  openDay: (day: Day, now?: Date) => Promise<void>;
  /** Works out the daily pages either side of `path`. */
  loadDayNeighbours: (path: string | null) => Promise<void>;
  loadTemplates: () => Promise<void>;
  /** A new page in `folder` from a template; resolves to its path. */
  createFromTemplate: (folder: string, template: string, title?: string) => Promise<string | null>;
  /** Copies a page into templates/; resolves to the template's path. */
  saveAsTemplate: (path: string) => Promise<string | null>;
  /** A template's body, filled in for the open page, for inserting. */
  templateBodyFor: (template: string, now?: Date) => Promise<string | null>;
}

function message(err: unknown): string {
  if (err instanceof NameError) return err.message;
  return `That could not be done. ${PlatformError.from(err).message}`;
}

export function createDailySlice(ctx: StoreContext): DailySlice {
  const { platform, set, get } = ctx;
  let neighboursToken = 0;

  /** The layout new pages start with, set for the vault. */
  const newLayout = () => {
    const status = get().status;
    return status.kind === 'open' ? status.vault.config.pages.layout : 'document';
  };

  /** Shows a page in the sidebar and opens it. */
  async function show(path: string): Promise<void> {
    const folder = parentVaultPath(path) ?? '';
    await get().reloadFolders(['', parentVaultPath(folder) ?? '', folder]);
    await get().revealFolder(folder);
    get().selectEntry(path);
    get().showView('files');
    await get().openPage(path);
  }

  async function readTemplate(path: string): Promise<string | null> {
    try {
      return await platform.readText(path);
    } catch (err) {
      if (PlatformError.from(err).kind === 'NotFound') return null;
      throw err;
    }
  }

  ctx.onVault({
    closed: () => {
      neighboursToken += 1;
      set({ dayNeighbours: NO_NEIGHBOURS, templates: [] });
    },
  });

  return {
    dayNeighbours: NO_NEIGHBOURS,
    templates: [],

    openToday: (now = new Date()) => get().openDay(dayOf(now), now),

    openDay: async (day, now = new Date()) => {
      if (get().status.kind !== 'open') return;
      const date = dateOf(day);
      if (date === null) return;
      try {
        const existing = await findDay(platform, day);
        if (existing !== null) {
          await show(existing);
          return;
        }
        const path = dailyPath(day);
        const id = crypto.randomUUID();
        const created = localTimestamp(now);
        const template = await readTemplate(DAILY_TEMPLATE);
        const layout = newLayout();
        const text = withLayout(
          template === null
            ? `---\nid: ${id}\ncreated: ${created}\n---\n# ${dayHeading(day)}\n\n`
            : pageFromTemplate(template, { title: day, date, now }, id, created),
          layout,
        );
        await platform.ensureDir(parentVaultPath(path) ?? '');
        try {
          await platform.createNew(path, text);
        } catch (err) {
          // Made a moment ago, by another device or a double click: just open it.
          if (PlatformError.from(err).kind !== 'AlreadyExists') throw err;
        }
        await show(path);
      } catch (err) {
        set({ sidebarNotice: message(err) });
      }
    },

    loadDayNeighbours: async (path) => {
      const token = (neighboursToken += 1);
      const day = path === null ? null : dayOfPath(path);
      if (day === null) {
        set({ dayNeighbours: NO_NEIGHBOURS });
        return;
      }
      let days: Map<Day, string>;
      try {
        days = await listDays(platform);
      } catch {
        days = new Map();
      }
      if (token !== neighboursToken) return;
      const previous = neighbourDay(days.keys(), day, -1);
      const next = neighbourDay(days.keys(), day, 1);
      set({
        dayNeighbours: {
          previous: previous === null ? null : (days.get(previous) ?? null),
          next: next === null ? null : (days.get(next) ?? null),
        },
      });
    },

    loadTemplates: async () => {
      try {
        set({ templates: await listTemplates(platform) });
      } catch {
        set({ templates: [] });
      }
    },

    createFromTemplate: async (folder, template, title) => {
      if (get().status.kind !== 'open') return null;
      try {
        const source = await platform.readText(template);
        const now = new Date();
        const path = await createPage(platform, folder, {
          ...(title === undefined || title.trim() === '' ? {} : { title: title.trim() }),
          text: (id, created, pageName) =>
            pageFromTemplate(source, { title: pageName, date: now, now }, id, created),
          layout: newLayout(),
        });
        await show(path);
        return path;
      } catch (err) {
        set({ sidebarNotice: message(err) });
        return null;
      }
    },

    saveAsTemplate: async (path) => {
      if (get().status.kind !== 'open') return null;
      try {
        if (get().page?.path === path) await get().savePageNow();
        const saved = await saveAsTemplate(platform, path);
        await get().loadTemplates();
        set({ sidebarNotice: `Saved as a template: ${pageTitle(baseName(saved))}.` });
        return saved;
      } catch (err) {
        set({ sidebarNotice: message(err) });
        return null;
      }
    },

    templateBodyFor: async (template, now = new Date()) => {
      const source = await readTemplate(template).catch(() => null);
      if (source === null) return null;
      return templateBody(source, { title: get().page?.title ?? '', date: now, now });
    },
  };
}
