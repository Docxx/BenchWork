import { getStroke } from 'perfect-freehand';
import type { InkPoint } from './stroke';

/**
 * Two ways to draw a stroke, to compare cost and feel:
 * - `simple`: round-capped segments whose width follows pressure. No library.
 * - `freehand`: perfect-freehand's filled outline, smoothed, with tapering.
 */
export type RendererKind = 'simple' | 'freehand';

export interface Drawable {
  colour: string;
  width: number;
  points: readonly InkPoint[];
}

/** A rectangle in CSS pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Width of a simple segment at a given pressure; 0.5 (no real pressure) gives `width`. */
export function simpleWidth(width: number, pressure: number): number {
  return width * (0.3 + 1.4 * pressure);
}

/** The area a stroke can cover, with room for its widest line. */
export function strokeBounds(points: readonly InkPoint[], width: number): Rect | null {
  const first = points[0];
  if (!first) return null;
  let minX = first.x;
  let maxX = first.x;
  let minY = first.y;
  let maxY = first.y;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const pad = simpleWidth(width, 1) * 1.5 + 2;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

export function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

/** Draws a stroke. `complete` is false while it is still being drawn. */
export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Drawable,
  kind: RendererKind,
  complete: boolean,
): void {
  const { points } = stroke;
  const first = points[0];
  if (!first) return;
  ctx.fillStyle = stroke.colour;
  ctx.strokeStyle = stroke.colour;

  if (kind === 'freehand') {
    const outline = getStroke(
      points.map((p) => [p.x, p.y, p.pressure]),
      {
        size: stroke.width * 2,
        thinning: 0.6,
        smoothing: 0.5,
        streamline: 0.3,
        simulatePressure: false,
        last: complete,
      },
    );
    const start = outline[0];
    if (!start) return;
    ctx.beginPath();
    ctx.moveTo(start[0], start[1]);
    for (const [x, y] of outline) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(first.x, first.y, simpleWidth(stroke.width, first.pressure) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let prev = first;
  for (const p of points.slice(1)) {
    ctx.lineWidth = simpleWidth(stroke.width, (prev.pressure + p.pressure) / 2);
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    prev = p;
  }
}
