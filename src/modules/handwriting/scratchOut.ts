import type { InkPoint, InkStroke } from '@core/api';

/**
 * Scratching out: scribbling back and forth over strokes erases them, as
 * crossing out on paper. The scribble itself goes too. A zigzag drawn over
 * nothing stays, as drawn.
 */

/** Back-and-forth turns a scribble has at least. */
const MIN_TURNS = 4;
/** How much longer than it is wide a scribble's path is, at least. */
const MIN_LENGTH_RATIO = 3;
/** Movement smaller than this, in CSS pixels, does not count as a turn. */
const TURN_SLOP = 4;
/** Share of a stroke's points under the scribble for it to be scratched out. */
const COVERED = 0.5;

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boxOf(points: readonly InkPoint[]): Box {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** Whether a stroke is a scribble: back and forth, again and again, over a small area. */
export function isScribble(points: readonly InkPoint[]): boolean {
  if (points.length < 12) return false;
  const box = boxOf(points);
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  // Along its longer side, which way the pen is going, and how often that turns.
  const axis = w >= h ? 0 : 1;
  let turns = 0;
  let direction = 0;
  let anchor = points[0]?.[axis] ?? 0;
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    length += Math.hypot(b[0] - a[0], b[1] - a[1]);
    const delta = b[axis] - anchor;
    if (Math.abs(delta) < TURN_SLOP) continue;
    const now = Math.sign(delta);
    if (direction !== 0 && now !== direction) turns += 1;
    direction = now;
    anchor = b[axis];
  }
  return turns >= MIN_TURNS && length >= MIN_LENGTH_RATIO * Math.max(w, h, 1);
}

/** The strokes mostly under a scribble. */
export function scribbledOver(scribble: InkStroke, others: readonly InkStroke[]): string[] {
  const pad = scribble.width * 2 + 4;
  const box = boxOf(scribble.points);
  const under = ([x, y]: InkPoint) =>
    x >= box.minX - pad && x <= box.maxX + pad && y >= box.minY - pad && y <= box.maxY + pad;
  return others
    .filter(
      (s) => s.id !== scribble.id && s.points.filter(under).length >= s.points.length * COVERED,
    )
    .map((s) => s.id);
}
