import type { ModuleContext, VaultItem } from '@core/api';

/**
 * The plan is read from page properties, so it lives in the pages
 * themselves and works without the module:
 *
 * - `start` and `end`: a task over those days (dates as YYYY-MM-DD).
 * - `date`: a task on one day, such as a daily note or an experiment.
 * - `milestone: true`: shown as a milestone on its `date` (or `start`).
 * - `after: [[Other page]]` (or a list): starts after those pages.
 * - `progress`: how far along, 0 to 100.
 *
 * Pages without dates are not on the plan.
 */

export interface PlanTask {
  /** The page's vault path. */
  path: string;
  title: string;
  /** The notebook it is in, the first folder of its path. */
  notebook: string;
  start: string;
  /** The last day, included. */
  end: string;
  milestone: boolean;
  progress: number;
  /** Paths of the pages it comes after. */
  after: string[];
  /** Whether its days are written as `date` rather than `start` and `end`. */
  singleDate: boolean;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A property value as a date, YYYY-MM-DD, or null. Times are dropped. */
export function asDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return formatDate(value);
  if (typeof value !== 'string') return null;
  const day = value.trim().slice(0, 10);
  const match = DATE.exec(day);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return formatDate(date) === day ? day : null;
}

/** A local date as YYYY-MM-DD. */
export function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The link targets in an `after` property: `[[A]]`, `[[A|alias]]`, or a list of them. */
export function linkTargets(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  const targets: string[] = [];
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const links = [...v.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)].map((m) =>
      (m[1] ?? '').trim(),
    );
    if (links.length > 0) targets.push(...links);
    else if (v.trim() !== '') targets.push(v.trim());
  }
  return targets.filter((t) => t !== '');
}

/** A page's place on the plan, or null if it has no dates. Links are not resolved yet. */
export function taskOf(
  item: VaultItem,
  props: Record<string, unknown>,
): (Omit<PlanTask, 'after'> & { afterTargets: string[] }) | null {
  const date = asDate(props['date']);
  const start = asDate(props['start']) ?? date;
  if (start === null) return null;
  const milestone = props['milestone'] === true;
  let end = milestone ? start : (asDate(props['end']) ?? start);
  if (end < start) end = start;
  const progress = typeof props['progress'] === 'number' ? props['progress'] : 0;
  return {
    path: item.path,
    title: item.title,
    notebook: item.path.includes('/') ? (item.path.split('/')[0] ?? '') : '',
    start,
    end,
    milestone,
    progress: Math.max(0, Math.min(100, progress)),
    afterTargets: linkTargets(props['after']),
    singleDate: asDate(props['start']) === null,
  };
}

/** Every page with dates, by notebook and then by start. */
export async function readPlan(ctx: ModuleContext): Promise<PlanTask[]> {
  const pages = (await ctx.app.items()).filter((i) => i.path.toLowerCase().endsWith('.md'));
  const found = await Promise.all(
    pages.map(async (item) => {
      const props = await ctx.app.pageProperties(item.path).catch(() => null);
      return props === null ? null : taskOf(item, props);
    }),
  );
  const tasks: PlanTask[] = [];
  for (const task of found) {
    if (task === null) continue;
    const after: string[] = [];
    const { afterTargets, ...rest } = task;
    for (const target of afterTargets) {
      const path = await ctx.app.resolveLink(target, task.path);
      if (path !== null && path !== task.path) after.push(path);
    }
    tasks.push({ ...rest, after: after.filter((p, i) => after.indexOf(p) === i) });
  }
  return tasks.sort(
    (a, b) =>
      a.notebook.localeCompare(b.notebook) ||
      a.start.localeCompare(b.start) ||
      a.title.localeCompare(b.title),
  );
}

/**
 * The properties to write when a task is moved or stretched to new days.
 * A one-day task written as `date` keeps `date`; one stretched over
 * several days is written as `start` and `end`.
 */
export function moveChanges(task: PlanTask, start: string, end: string): Record<string, unknown> {
  if (task.milestone) return task.singleDate ? { date: start } : { start, end: null };
  if (task.singleDate && start === end) return { date: start, start: null, end: null };
  if (task.singleDate) return { date: null, start, end };
  return { start, end };
}
