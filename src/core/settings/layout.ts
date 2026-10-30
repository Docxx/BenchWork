/**
 * Where widgets go outside Home: three docks, each a group of tabs. The
 * left dock is under the notebooks; the right side is split into a top and
 * a bottom dock. Saved per vault on each device, with Home's cards.
 */

export type DockPlace = 'left' | 'rightTop' | 'rightBottom';
export const DOCK_PLACES: readonly DockPlace[] = ['left', 'rightTop', 'rightBottom'];

export interface DockLayout {
  left: string[];
  rightTop: string[];
  rightBottom: string[];
  /** Widgets closed from a dock, so ones that start beside pages stay away. */
  closed: string[];
  /** The left dock's height, in pixels. */
  leftSize: number;
  /** The share of the right side the top dock takes, from 0.15 to 0.85. */
  rightSplit: number;
}

export const LEFT_SIZE = { min: 120, max: 900, initial: 280 } as const;
export const RIGHT_SPLIT = { min: 0.15, max: 0.85, initial: 0.6 } as const;

/** Widgets beside pages before anything is moved. */
export const SIDE_START = ['core.outline', 'core.backlinks'];

export function defaultDocks(): DockLayout {
  return {
    left: [],
    rightTop: [...SIDE_START],
    rightBottom: [],
    closed: [],
    leftSize: LEFT_SIZE.initial,
    rightSplit: RIGHT_SPLIT.initial,
  };
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

const within = (value: unknown, range: { min: number; max: number }, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(range.max, Math.max(range.min, value))
    : fallback;

export function parseDocks(value: unknown): DockLayout {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return defaultDocks();
  const r = value as Record<string, unknown>;
  return {
    left: strings(r['left']),
    rightTop: strings(r['rightTop']),
    rightBottom: strings(r['rightBottom']),
    closed: strings(r['closed']),
    leftSize: within(r['leftSize'], LEFT_SIZE, LEFT_SIZE.initial),
    rightSplit: within(r['rightSplit'], RIGHT_SPLIT, RIGHT_SPLIT.initial),
  };
}

/** A widget, as far as placing it goes. */
export interface Placeable {
  id: string;
  starts?: { home?: boolean; side?: boolean };
}

/**
 * What each dock shows: the widgets placed there that exist now, and
 * widgets that start beside pages, at the end of the top right, unless
 * they were placed elsewhere or closed.
 */
export function dockContents(
  docks: DockLayout,
  widgets: readonly Placeable[],
): Record<DockPlace, string[]> {
  const known = new Set(widgets.map((w) => w.id));
  const placed = new Set([...docks.left, ...docks.rightTop, ...docks.rightBottom]);
  const arriving = widgets
    .filter((w) => w.starts?.side === true && !placed.has(w.id) && !docks.closed.includes(w.id))
    .map((w) => w.id);
  return {
    left: docks.left.filter((id) => known.has(id)),
    rightTop: [...docks.rightTop, ...arriving].filter((id) => known.has(id)),
    rightBottom: docks.rightBottom.filter((id) => known.has(id)),
  };
}

/**
 * Puts a widget in a dock, at `index` or the end, taking it out of
 * wherever it was. `shown` is what the docks show now, so widgets that
 * arrived by themselves are kept where they are.
 */
export function placeWidget(
  docks: DockLayout,
  shown: Record<DockPlace, string[]>,
  id: string,
  to: DockPlace,
  index?: number,
): DockLayout {
  const lists = Object.fromEntries(
    DOCK_PLACES.map((p) => [p, [...new Set([...docks[p], ...shown[p]])].filter((w) => w !== id)]),
  ) as Record<DockPlace, string[]>;
  const target = lists[to];
  target.splice(index === undefined ? target.length : Math.max(0, index), 0, id);
  return { ...docks, ...lists, closed: docks.closed.filter((w) => w !== id) };
}

/** Takes a widget out of the docks, so it does not come back by itself. */
export function closeWidget(docks: DockLayout, id: string): DockLayout {
  return {
    ...docks,
    left: docks.left.filter((w) => w !== id),
    rightTop: docks.rightTop.filter((w) => w !== id),
    rightBottom: docks.rightBottom.filter((w) => w !== id),
    closed: docks.closed.includes(id) ? docks.closed : [...docks.closed, id],
  };
}

/** Widgets on Home: those that start there or were added, less those hidden. */
export function homeWidgets(widgets: readonly Placeable[], added: readonly string[]): string[] {
  return widgets.filter((w) => w.starts?.home === true || added.includes(w.id)).map((w) => w.id);
}
