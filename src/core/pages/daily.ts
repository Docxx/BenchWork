import { DAILY_NOTEBOOK, isPage, PAGE_EXTENSION } from '../notebooks/notebookTree';
import { baseName, joinVaultPath, parentVaultPath, type PlatformAdapter } from '../platform';
import { formatDate } from './templates';

/**
 * The Daily notebook: one page per day, named by date so pages sort in
 * order and Obsidian reads them as daily notes. New pages go in a section
 * per month, `Daily/2026-10/2026-10-22.md`; pages straight in `Daily/` are
 * found too.
 */

/** A day as `YYYY-MM-DD`. */
export type Day = string;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^\d{4}-\d{2}$/;

const pad = (n: number) => String(n).padStart(2, '0');

/** The local date of `date`, as `YYYY-MM-DD`. */
export function dayOf(date: Date): Day {
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Midnight local time on `day`, or null if it is not a real date. */
export function dateOf(day: string): Date | null {
  const m = DAY.exec(day);
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dayOf(date) === day ? date : null;
}

/** Where a new page for `day` goes. */
export function dailyPath(day: Day): string {
  return joinVaultPath(DAILY_NOTEBOOK, `${day.slice(0, 7)}/${day}${PAGE_EXTENSION}`);
}

/** The day a page is for, if it is a daily page, else null. */
export function dayOfPath(path: string): Day | null {
  const parent = parentVaultPath(path);
  const inDaily =
    parent === DAILY_NOTEBOOK ||
    (parentVaultPath(parent ?? '') === DAILY_NOTEBOOK && MONTH.test(baseName(parent ?? '')));
  const name = baseName(path);
  if (!inDaily || !isPage(name)) return null;
  const day = name.slice(0, -PAGE_EXTENSION.length);
  return dateOf(day) === null ? null : day;
}

/** A heading for a daily page, such as `Thursday 22 October 2026`. */
export function dayHeading(day: Day): string {
  const date = dateOf(day);
  if (!date) return day;
  return formatDate(date, 'dddd D MMMM YYYY');
}

/** Every daily page there is, by day. A day in both layouts uses the month section's. */
export async function listDays(platform: PlatformAdapter): Promise<Map<Day, string>> {
  const days = new Map<Day, string>();
  if (!(await platform.exists(DAILY_NOTEBOOK))) return days;
  const add = (path: string) => {
    const day = dayOfPath(path);
    if (day !== null && (!days.has(day) || parentVaultPath(path) !== DAILY_NOTEBOOK)) {
      days.set(day, path);
    }
  };
  for (const entry of await platform.listDir(DAILY_NOTEBOOK)) {
    if (!entry.isDir) {
      add(entry.path);
    } else if (MONTH.test(entry.name)) {
      for (const page of await platform.listDir(entry.path)) {
        if (!page.isDir) add(page.path);
      }
    }
  }
  return days;
}

/** The existing page for `day`, in either layout, or null. */
export async function findDay(platform: PlatformAdapter, day: Day): Promise<string | null> {
  for (const path of [dailyPath(day), joinVaultPath(DAILY_NOTEBOOK, `${day}${PAGE_EXTENSION}`)]) {
    if (await platform.exists(path)) return path;
  }
  return null;
}

/** The nearest day before (-1) or after (+1) `day` that has a page. */
export function neighbourDay(days: Iterable<Day>, day: Day, direction: -1 | 1): Day | null {
  let best: Day | null = null;
  for (const d of days) {
    if (
      direction < 0
        ? d < day && (best === null || d > best)
        : d > day && (best === null || d < best)
    ) {
      best = d;
    }
  }
  return best;
}
