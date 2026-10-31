import type { ScheduledItem } from '@core/api';

/**
 * The planner's chart, worked out apart from drawing it: days, rows and
 * groups, colours, moving an item with the ones that wait for it, and the
 * critical path.
 */

export type Zoom = 'day' | 'week' | 'month' | 'quarter';
export type GroupBy = 'none' | 'notebook' | 'person' | 'priority' | 'kind';
export type ColourBy = 'notebook' | 'person' | 'priority' | 'kind' | 'progress';

/** Pixels for a day at each zoom. */
export const DAY_PX: Record<Zoom, number> = { day: 40, week: 16, month: 5, quarter: 1.8 };

const DAY_MS = 86_400_000;

function utc(day: string): number {
  return Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
}

/** `day` moved by `n` days. */
export function addDays(day: string, n: number): string {
  return new Date(utc(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Days from `a` to `b`: 0 for the same day. */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / DAY_MS);
}

/** Days an item lasts, both ends included. */
export const span = (i: Pick<ScheduledItem, 'start' | 'end'>) => daysBetween(i.start, i.end) + 1;

/** The days the chart shows: a week before the first item to a fortnight after the last, with today. */
export function chartRange(
  items: readonly ScheduledItem[],
  today: string,
): { from: string; to: string } {
  const starts = [today, ...items.map((i) => i.start)].sort();
  const ends = [today, ...items.map((i) => i.end)].sort();
  const from = addDays(starts[0] ?? today, -7);
  let to = addDays(ends.at(-1) ?? today, 14);
  if (daysBetween(from, to) < 60) to = addDays(from, 60);
  return { from, to };
}

/** What kind of thing an item is, from its source: tasks, or planned pages. */
export function kindOf(item: ScheduledItem): string {
  if (item.key.startsWith('tasks.')) return 'Tasks';
  if (item.key.startsWith('planner.')) return 'Pages';
  return 'Other';
}

const PRIORITY_NAMES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];

/** The group an item goes in. */
export function groupOf(item: ScheduledItem, by: GroupBy): string {
  switch (by) {
    case 'none':
      return '';
    case 'notebook':
      return item.notebook === '' ? 'Vault' : item.notebook;
    case 'person':
      return item.person ?? 'No one';
    case 'priority':
      return item.priority === null
        ? 'No priority'
        : (PRIORITY_NAMES[item.priority - 1] ?? 'Other');
    case 'kind':
      return kindOf(item);
  }
}

export type Row =
  | { kind: 'group'; label: string; count: number }
  | { kind: 'item'; item: ScheduledItem; depth: number; hasParts: boolean };

/**
 * The chart's rows: groups in order, and in each, items by start date with
 * their parts indented under them, unless folded.
 */
export function buildRows(
  items: readonly ScheduledItem[],
  by: GroupBy,
  folded: ReadonlySet<string>,
): Row[] {
  const keys = new Set(items.map((i) => i.key));
  const parts = new Map<string, ScheduledItem[]>();
  for (const i of items) {
    if (i.parent !== null && keys.has(i.parent)) {
      parts.set(i.parent, [...(parts.get(i.parent) ?? []), i]);
    }
  }
  const byStart = (a: ScheduledItem, b: ScheduledItem) =>
    a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.title.localeCompare(b.title);
  const groups = new Map<string, ScheduledItem[]>();
  for (const i of items) {
    if (i.parent !== null && keys.has(i.parent)) continue;
    const g = groupOf(i, by);
    groups.set(g, [...(groups.get(g) ?? []), i]);
  }
  const rows: Row[] = [];
  const add = (item: ScheduledItem, depth: number) => {
    const own = (parts.get(item.key) ?? []).sort(byStart);
    rows.push({ kind: 'item', item, depth, hasParts: own.length > 0 });
    if (!folded.has(item.key)) for (const p of own) add(p, depth + 1);
  };
  const names = [...groups.keys()].sort((a, b) =>
    by === 'priority' ? PRIORITY_ORDER(a) - PRIORITY_ORDER(b) : a.localeCompare(b),
  );
  for (const name of names) {
    const list = (groups.get(name) ?? []).sort(byStart);
    if (by !== 'none') rows.push({ kind: 'group', label: name, count: list.length });
    for (const item of list) add(item, 0);
  }
  return rows;
}

function PRIORITY_ORDER(name: string): number {
  const i = PRIORITY_NAMES.indexOf(name);
  return i < 0 ? 99 : i;
}

export const COLOURS = [
  'blue',
  'teal',
  'orange',
  'purple',
  'green',
  'red',
  'yellow',
  'grey',
] as const;
const PRIORITY_COLOURS = ['red', 'orange', 'yellow', 'blue', 'grey'] as const;

/** A section colour name for an item: the same value keeps the same colour. */
export function colourOf(item: ScheduledItem, by: ColourBy, order: readonly string[]): string {
  if (by === 'priority') {
    return item.priority === null ? 'grey' : (PRIORITY_COLOURS[item.priority - 1] ?? 'grey');
  }
  if (by === 'progress') {
    if (item.done || item.progress >= 1) return 'green';
    return item.progress > 0 ? 'blue' : 'grey';
  }
  const value =
    by === 'notebook' ? item.notebook : by === 'person' ? (item.person ?? '') : kindOf(item);
  const i = order.indexOf(value);
  return COLOURS[(i < 0 ? 0 : i) % COLOURS.length] ?? 'blue';
}

/** The values items are coloured by, in a steady order, for colourOf. */
export function colourOrder(items: readonly ScheduledItem[], by: ColourBy): string[] {
  const values = items.map((i) =>
    by === 'notebook' ? i.notebook : by === 'person' ? (i.person ?? '') : kindOf(i),
  );
  return [...new Set(values)].sort();
}

/**
 * New dates after moving one item: the item itself, and any item waiting
 * for it that would now start before it ends, pushed later, keeping its
 * length, and so on down the line. Summary items are left to their parts.
 */
export function cascade(
  items: readonly ScheduledItem[],
  key: string,
  start: string,
  end: string,
): Map<string, { start: string; end: string }> {
  const moved = new Map<string, { start: string; end: string }>([[key, { start, end }]]);
  const after = (k: string) => items.filter((i) => i.after.includes(k) && i.summary !== true);
  const queue = [key];
  let guard = 0;
  while (queue.length > 0 && guard < 10_000) {
    guard += 1;
    const k = queue.shift() ?? '';
    const pred = moved.get(k);
    if (!pred) continue;
    for (const next of after(k)) {
      const current = moved.get(next.key) ?? { start: next.start, end: next.end };
      if (current.start > pred.end) continue;
      const shift = daysBetween(current.start, pred.end) + 1;
      moved.set(next.key, {
        start: addDays(current.start, shift),
        end: addDays(current.end, shift),
      });
      queue.push(next.key);
    }
  }
  return moved;
}

/**
 * The critical path: in each chain of items that wait for one another, the
 * items with no slack, which delay the end of that chain if they slip.
 * Each must finish before the items waiting for it start, and the last
 * ones by the chain's end. Items that wait for nothing and that nothing
 * waits for are left out.
 */
export function criticalPath(items: readonly ScheduledItem[]): Set<string> {
  const real = items.filter((i) => i.summary !== true);
  const byKey = new Map(real.map((i) => [i.key, i]));
  const successors = new Map<string, ScheduledItem[]>();
  for (const i of real) {
    for (const p of i.after) {
      if (byKey.has(p)) successors.set(p, [...(successors.get(p) ?? []), i]);
    }
  }

  // Each chain, as the items linked to one another either way.
  const chainOf = new Map<string, number>();
  let chains = 0;
  for (const start of real) {
    if (chainOf.has(start.key)) continue;
    const queue = [start];
    chainOf.set(start.key, chains);
    while (queue.length > 0) {
      const i = queue.pop();
      if (!i) break;
      const linked = [...i.after.map((k) => byKey.get(k)), ...(successors.get(i.key) ?? [])].filter(
        (n): n is ScheduledItem => n !== undefined,
      );
      for (const n of linked) {
        if (!chainOf.has(n.key)) {
          chainOf.set(n.key, chains);
          queue.push(n);
        }
      }
    }
    chains += 1;
  }
  const chainEnd = new Map<number, string>();
  for (const i of real) {
    const c = chainOf.get(i.key) ?? -1;
    const known = chainEnd.get(c);
    if (known === undefined || i.end > known) chainEnd.set(c, i.end);
  }

  const latestFinish = new Map<string, string>();
  const visiting = new Set<string>();
  const finish = (i: ScheduledItem): string => {
    const end = chainEnd.get(chainOf.get(i.key) ?? -1) ?? i.end;
    const known = latestFinish.get(i.key);
    if (known !== undefined) return known;
    if (visiting.has(i.key)) return end; // a loop: no slack worked out through it
    visiting.add(i.key);
    let lf = end;
    for (const s of successors.get(i.key) ?? []) {
      const latestStart = addDays(finish(s), -(span(s) - 1));
      const before = addDays(latestStart, -1);
      if (before < lf) lf = before;
    }
    visiting.delete(i.key);
    latestFinish.set(i.key, lf);
    return lf;
  };
  const critical = new Set<string>();
  for (const i of real) {
    const linked = i.after.some((k) => byKey.has(k)) || (successors.get(i.key)?.length ?? 0) > 0;
    if (linked && daysBetween(i.end, finish(i)) <= 0) critical.add(i.key);
  }
  return critical;
}
