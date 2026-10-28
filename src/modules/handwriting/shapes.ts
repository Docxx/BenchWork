import type { InkPoint, InkStroke } from '@core/api';

/**
 * Tidy shapes from strokes: holding the pen still at the end of a stroke
 * turns a rough line into a straight one, and a rough loop into a
 * rectangle or an ellipse, whichever fits it better. Anything else stays
 * as written.
 */

export type Shape = 'line' | 'rectangle' | 'ellipse';

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Smaller than this across, in CSS pixels, a stroke is a mark, not a shape. */
const MIN_SIZE = 24;
/** How straight a line must be: its widest wobble against its length. */
const LINE_WOBBLE = 0.08;
/** How near its start a loop must end, against its size. */
const LOOP_GAP = 0.35;
/** How closely a loop must follow a rectangle's sides, against its smaller side. */
const RECTANGLE_FIT = 0.13;
/** How closely a loop must follow an ellipse, as a share of its radius. */
const ELLIPSE_FIT = 0.2;
/** Points along a tidied shape, every few pixels, so it draws smoothly. */
const SPACING = 4;

function boundsOf(points: readonly InkPoint[]): Bounds {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

/** Distance from a point to the line through a and b. */
function offLine(p: InkPoint, a: InkPoint, b: InkPoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / length;
}

/** Which shape a stroke is meant to be, or null for none. */
export function recognise(points: readonly InkPoint[]): Shape | null {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || points.length < 3) return null;
  const b = boundsOf(points);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const size = Math.hypot(w, h);
  if (size < MIN_SIZE) return null;

  const span = Math.hypot(last[0] - first[0], last[1] - first[1]);
  const wobble = Math.max(...points.map((p) => offLine(p, first, last)));
  if (span > size * 0.8 && wobble < span * LINE_WOBBLE) return 'line';
  // A loop ends near where it began; a hand often carries on past the start.
  const start = points.slice(0, Math.max(2, Math.ceil(points.length / 4)));
  const gap = Math.min(...start.map((p) => Math.hypot(last[0] - p[0], last[1] - p[1])));
  if (gap > size * LOOP_GAP || Math.min(w, h) < MIN_SIZE / 2) return null;

  // Mean distance to the nearest side, against the smaller side.
  const rectangle =
    points.reduce(
      (sum, [x, y]) =>
        sum +
        Math.min(
          Math.abs(x - b.minX),
          Math.abs(x - b.maxX),
          Math.abs(y - b.minY),
          Math.abs(y - b.maxY),
        ),
      0,
    ) /
    points.length /
    Math.min(w, h);
  // Mean distance from the ellipse, as a share of its radius.
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const ellipse =
    points.reduce(
      (sum, [x, y]) => sum + Math.abs(Math.hypot((x - cx) / (w / 2), (y - cy) / (h / 2)) - 1),
      0,
    ) / points.length;
  const fitsRectangle = rectangle < RECTANGLE_FIT;
  const fitsEllipse = ellipse < ELLIPSE_FIT;
  if (fitsRectangle && fitsEllipse)
    return rectangle / RECTANGLE_FIT <= ellipse / ELLIPSE_FIT ? 'rectangle' : 'ellipse';
  if (fitsRectangle) return 'rectangle';
  if (fitsEllipse) return 'ellipse';
  return null;
}

/** Points every few pixels from a to b, leaving out b. */
function along(a: [number, number], b: [number, number]): [number, number][] {
  const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / SPACING));
  const out: [number, number][] = [];
  for (let i = 0; i < steps; i += 1) {
    out.push([a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps]);
  }
  return out;
}

/** The outline of a shape, as points. */
function outline(shape: Shape, points: readonly InkPoint[]): [number, number][] {
  const first = points[0] ?? [0, 0, 0, 0];
  const last = points.at(-1) ?? first;
  if (shape === 'line')
    return [...along([first[0], first[1]], [last[0], last[1]]), [last[0], last[1]]];
  const b = boundsOf(points);
  if (shape === 'rectangle') {
    const corners: [number, number][] = [
      [b.minX, b.minY],
      [b.maxX, b.minY],
      [b.maxX, b.maxY],
      [b.minX, b.maxY],
    ];
    return [
      ...corners.flatMap((c, i) => along(c, corners[(i + 1) % 4] ?? c)),
      corners[0] ?? [0, 0],
    ];
  }
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const rx = (b.maxX - b.minX) / 2;
  const ry = (b.maxY - b.minY) / 2;
  const count = Math.max(24, Math.ceil((Math.PI * (rx + ry)) / SPACING));
  return Array.from({ length: count + 1 }, (_, i): [number, number] => {
    const a = (i / count) * Math.PI * 2;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  });
}

/** The stroke as a tidy shape, keeping its id, tool, colour and width; null if it is not one. */
export function snapShape(stroke: InkStroke): InkStroke | null {
  const shape = recognise(stroke.points);
  if (shape === null) return null;
  const pressure = stroke.points.reduce((sum, p) => sum + p[2], 0) / stroke.points.length;
  const round = (n: number) => Math.round(n * 100) / 100;
  const points = outline(shape, stroke.points).map(([x, y], i): InkPoint => [
    round(x),
    round(y),
    Math.round(pressure * 1000) / 1000,
    i * 8,
  ]);
  return { ...stroke, points };
}
