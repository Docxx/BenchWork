import type { InkStroke, InkToolPoint } from '@core/api';

/**
 * Choosing strokes by drawing a loop round them, then moving, recolouring
 * or deleting them together.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Whether a point is inside a loop (the even-odd rule). */
export function insideLoop(loop: readonly InkToolPoint[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
    const a = loop[i];
    const b = loop[j];
    if (!a || !b) continue;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The strokes mostly inside a loop: more than half their points. */
export function strokesInLoop(
  strokes: readonly InkStroke[],
  loop: readonly InkToolPoint[],
): Set<string> {
  const chosen = new Set<string>();
  if (loop.length < 3) return chosen;
  for (const s of strokes) {
    const inside = s.points.filter(([x, y]) => insideLoop(loop, x, y)).length;
    if (inside * 2 > s.points.length) chosen.add(s.id);
  }
  return chosen;
}

/** The area the chosen strokes cover, with room for their width; null for none. */
export function boxOf(strokes: readonly InkStroke[], ids: ReadonlySet<string>): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    if (!ids.has(s.id)) continue;
    const pad = s.width * 3 + 4;
    for (const [x, y] of s.points) {
      minX = Math.min(minX, x - pad);
      minY = Math.min(minY, y - pad);
      maxX = Math.max(maxX, x + pad);
      maxY = Math.max(maxY, y + pad);
    }
  }
  return minX === Infinity ? null : { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function inBox(box: Box | null, x: number, y: number): boolean {
  return box !== null && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The strokes with the chosen ones moved by dx, dy. */
export function moveStrokes(
  strokes: readonly InkStroke[],
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
): InkStroke[] {
  return strokes.map((s) =>
    ids.has(s.id)
      ? { ...s, points: s.points.map(([x, y, p, t]) => [round(x + dx), round(y + dy), p, t]) }
      : s,
  );
}

export function recolourStrokes(
  strokes: readonly InkStroke[],
  ids: ReadonlySet<string>,
  colour: string,
): InkStroke[] {
  return strokes.map((s) => (ids.has(s.id) ? { ...s, colour } : s));
}

export function withoutStrokes(
  strokes: readonly InkStroke[],
  ids: ReadonlySet<string>,
): InkStroke[] {
  return strokes.filter((s) => !ids.has(s.id));
}
