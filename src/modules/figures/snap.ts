import type { Box } from './model';

/**
 * Snapping, so blocks line up without care: an edge being moved is caught
 * by the page's edges, other blocks' edges, and the figure's gap beside
 * them. A guide line shows each catch.
 */

export interface Guide {
  /** A line down the page at x, or across it at y, in mm. */
  axis: 'x' | 'y';
  at: number;
}

export interface Edges {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
}

/** The lines an edge can be caught by along one axis. */
function targets(others: readonly Box[], axis: 'x' | 'y', gap: number, page: number | null) {
  const lines: { at: number; guide: number }[] = [{ at: 0, guide: 0 }];
  if (page !== null) lines.push({ at: page, guide: page });
  for (const o of others) {
    const a = axis === 'x' ? o.x : o.y;
    const b = a + (axis === 'x' ? o.w : o.h);
    lines.push({ at: a, guide: a }, { at: b, guide: b });
    if (gap > 0) lines.push({ at: b + gap, guide: b }, { at: a - gap, guide: a });
  }
  return lines;
}

/** The nearest catch for any of the edges given, as a shift: null if none is near. */
function nearest(edges: readonly number[], lines: { at: number; guide: number }[], reach: number) {
  let best: { shift: number; guide: number } | null = null;
  for (const e of edges) {
    for (const l of lines) {
      const shift = l.at - e;
      if (Math.abs(shift) <= reach && (best === null || Math.abs(shift) < Math.abs(best.shift)))
        best = { shift, guide: l.guide };
    }
  }
  return best;
}

/** A box being moved, caught by the nearest line on each axis. */
export function snapMove(
  box: Box,
  others: readonly Box[],
  o: { pageWidth: number; gap: number; reach: number },
): { box: Box; guides: Guide[] } {
  const guides: Guide[] = [];
  const out = { ...box };
  const x = nearest(
    [box.x, box.x + box.w, box.x + box.w / 2],
    [
      ...targets(others, 'x', o.gap, o.pageWidth),
      ...others.map((b) => ({ at: b.x + b.w / 2, guide: b.x + b.w / 2 })),
    ],
    o.reach,
  );
  if (x) {
    out.x += x.shift;
    guides.push({ axis: 'x', at: x.guide });
  }
  const y = nearest([box.y, box.y + box.h], targets(others, 'y', o.gap, null), o.reach);
  if (y) {
    out.y += y.shift;
    guides.push({ axis: 'y', at: y.guide });
  }
  return { box: out, guides };
}

/** A box being resized by some of its edges, each caught on its own. */
export function snapResize(
  box: Box,
  edges: Edges,
  others: readonly Box[],
  o: { pageWidth: number; gap: number; reach: number },
): { box: Box; guides: Guide[] } {
  const guides: Guide[] = [];
  let { x, y, w, h } = box;
  const xs = targets(others, 'x', o.gap, o.pageWidth);
  const ys = targets(others, 'y', o.gap, null);
  if (edges.left) {
    const c = nearest([x], xs, o.reach);
    if (c) {
      x += c.shift;
      w -= c.shift;
      guides.push({ axis: 'x', at: c.guide });
    }
  }
  if (edges.right) {
    const c = nearest([x + w], xs, o.reach);
    if (c) {
      w += c.shift;
      guides.push({ axis: 'x', at: c.guide });
    }
  }
  if (edges.top) {
    const c = nearest([y], ys, o.reach);
    if (c) {
      y += c.shift;
      h -= c.shift;
      guides.push({ axis: 'y', at: c.guide });
    }
  }
  if (edges.bottom) {
    const c = nearest([y + h], ys, o.reach);
    if (c) {
      h += c.shift;
      guides.push({ axis: 'y', at: c.guide });
    }
  }
  return { box: { x, y, w, h }, guides };
}

/** A box resized from its starting box by a drag of (dx, dy) on some edges, kept at least `min`. */
export function resized(start: Box, edges: Edges, dx: number, dy: number, min = 4): Box {
  let { x, y, w, h } = start;
  if (edges.left) {
    const nx = Math.min(x + w - min, x + dx);
    w += x - nx;
    x = nx;
  }
  if (edges.right) w = Math.max(min, w + dx);
  if (edges.top) {
    const ny = Math.min(y + h - min, y + dy);
    h += y - ny;
    y = ny;
  }
  if (edges.bottom) h = Math.max(min, h + dy);
  return { x, y, w, h };
}

/**
 * A box resized by a corner, kept to its starting shape: the width leads,
 * and the height follows from the side that is not pinned.
 */
export function keepShape(start: Box, box: Box, edges: Edges): Box {
  const corner = (edges.left || edges.right) && (edges.top || edges.bottom);
  if (!corner || start.w <= 0) return box;
  const h = (box.w * start.h) / start.w;
  return { ...box, h, y: edges.top ? start.y + start.h - h : start.y };
}
