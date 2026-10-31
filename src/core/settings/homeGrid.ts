/**
 * Home as a grid of cards: 12 columns, rows of a fixed height. Each card
 * has a place and a size in grid cells. Moving or resizing one pushes
 * those it would cover further down, and every card then rises as far as
 * it can, so there are no gaps to tidy.
 */

export const COLUMNS = 12;
/** One row's height, in pixels; cards are a whole number of rows high. */
export const ROW_PX = 32;
/** The space between cards, in pixels. */
export const GAP_PX = 16;

export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Grid = Record<string, Cell>;

export const MIN_W = 2;
export const MIN_H = 3;

/** How big a card starts, by what it is. */
export function startSize(id: string, wide: boolean): { w: number; h: number } {
  const tall: Record<string, number> = {
    'core.calendar': 12,
    'home.tools': 8,
    'home.recent': 9,
    'papers.latest': 10,
    'lab-tools.timers': 7,
  };
  return { w: wide ? 8 : 4, h: tall[id] ?? 6 };
}

const overlaps = (a: Cell, b: Cell) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** A cell kept inside the grid's columns and at least its smallest size. */
export function clampCell(cell: Cell): Cell {
  const w = Math.min(COLUMNS, Math.max(MIN_W, Math.round(cell.w)));
  return {
    w,
    h: Math.max(MIN_H, Math.round(cell.h)),
    x: Math.min(COLUMNS - w, Math.max(0, Math.round(cell.x))),
    y: Math.max(0, Math.round(cell.y)),
  };
}

/** Cards in reading order: top to bottom, then left to right. */
export function readingOrder(grid: Grid): string[] {
  return Object.keys(grid).sort((a, b) => {
    const ca = grid[a];
    const cb = grid[b];
    if (!ca || !cb) return 0;
    return ca.y - cb.y || ca.x - cb.x;
  });
}

/**
 * Every card rises as far as it can without covering another, top cards
 * first; `fixed` stays exactly where it is.
 */
export function compact(grid: Grid, fixed: string | null = null): Grid {
  const placed: Grid = {};
  if (fixed !== null && grid[fixed]) placed[fixed] = grid[fixed];
  for (const id of readingOrder(grid)) {
    if (id === fixed) continue;
    const cell = grid[id];
    if (!cell) continue;
    let y = 0;
    // The first height from the top where it covers nothing placed.
    for (;;) {
      const tryCell = { ...cell, y };
      const hit = Object.values(placed).find((p) => overlaps(p, tryCell));
      if (!hit) break;
      y = hit.y + hit.h;
    }
    placed[id] = { ...cell, y };
  }
  return placed;
}

/** The grid with one card at a new place or size, the rest moved out of its way. */
export function placeCard(grid: Grid, id: string, cell: Cell): Grid {
  return compact({ ...grid, [id]: clampCell(cell) }, id);
}

/**
 * Places every card in `ids`: those already on the grid stay, new ones go
 * at the bottom, in turn, filling rows left to right.
 */
export function fillGrid(
  grid: Grid,
  ids: readonly string[],
  sizeOf: (id: string) => { w: number; h: number },
): Grid {
  const result: Grid = {};
  for (const id of ids) {
    const cell = grid[id];
    if (cell) result[id] = clampCell(cell);
  }
  for (const id of ids) {
    if (result[id]) continue;
    const { w, h } = sizeOf(id);
    const bottom = Math.max(0, ...Object.values(result).map((c) => c.y + c.h));
    // The first free spot in the last row of cards, else below everything.
    let spot: Cell | null = null;
    const lastRow = Object.values(result).filter((c) => c.y + c.h === bottom);
    const rowTop = lastRow.length > 0 ? Math.min(...lastRow.map((c) => c.y)) : bottom;
    for (let x = 0; x + w <= COLUMNS && spot === null; x += 1) {
      const tryCell = { x, y: rowTop, w, h };
      if (!Object.values(result).some((c) => overlaps(c, tryCell))) spot = tryCell;
    }
    result[id] = clampCell(spot ?? { x: 0, y: bottom, w, h });
  }
  return compact(result);
}

/** A grid as saved: whole numbers, inside the columns. */
export function parseGrid(value: unknown): Grid {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const grid: Grid = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const c = raw as Record<string, unknown>;
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const [x, y, w, h] = [n(c['x']), n(c['y']), n(c['w']), n(c['h'])];
    if (x === null || y === null || w === null || h === null) continue;
    grid[id] = clampCell({ x, y, w, h });
  }
  return grid;
}
