import { getStroke } from 'perfect-freehand';
import { newStrokeId, type InkPoint, type InkStroke, type InkTool } from './inkFile';

/**
 * Turning pointer samples into strokes, and strokes into shapes to draw.
 * Measured in the Phase 1 ink spike (spikes/ink): perfect-freehand's
 * smoothed outline felt best with the S Pen.
 */

/** One pointer sample, as read from a pointer event. */
export interface RawPoint {
  x: number;
  y: number;
  pressure: number;
  /** Event time in milliseconds. */
  time: number;
}

/** Pressure as stored: real for pens, 0.5 for mice and fingers, which have none. */
export function strokePressure(pointerType: string, pressure: number): number {
  if (pointerType !== 'pen') return 0.5;
  return Math.min(1, Math.max(0, pressure));
}

const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/** Builds one stroke at a time from pointer samples. */
export class StrokeRecorder {
  private stroke: InkStroke | null = null;
  private start = 0;

  get current(): InkStroke | null {
    return this.stroke;
  }

  begin(tool: InkTool, colour: string, width: number, first: RawPoint): void {
    this.start = first.time;
    this.stroke = { id: newStrokeId(), tool, colour, width, points: [] };
    this.add([first]);
  }

  /**
   * Adds samples, rounded to keep files small: 0.01 px, 0.001 pressure and
   * whole milliseconds. Samples that repeat the last position are skipped.
   */
  add(samples: readonly RawPoint[]): void {
    const stroke = this.stroke;
    if (!stroke) return;
    for (const s of samples) {
      const point: InkPoint = [
        round(s.x, 2),
        round(s.y, 2),
        round(s.pressure, 3),
        Math.max(0, Math.round(s.time - this.start)),
      ];
      const last = stroke.points.at(-1);
      if (last && last[0] === point[0] && last[1] === point[1]) continue;
      stroke.points.push(point);
    }
  }

  /** Finishes the stroke and returns it. */
  end(): InkStroke | null {
    const stroke = this.stroke;
    this.stroke = null;
    return stroke;
  }

  /** Drops the stroke, for example when a touch turns out to be a palm. */
  cancel(): void {
    this.stroke = null;
  }
}

/** How each tool looks: a highlighter is broad, even and see-through. */
export const TOOL_STYLE: Record<InkTool, { scale: number; thinning: number; alpha: number }> = {
  pen: { scale: 2, thinning: 0.6, alpha: 1 },
  highlighter: { scale: 6, thinning: 0, alpha: 0.35 },
};

/**
 * The outline of a stroke as a polygon, smoothed and following pressure.
 * `complete` is false while it is still being drawn, so its end stays round.
 */
export function strokeOutline(stroke: InkStroke, complete = true): number[][] {
  const style = TOOL_STYLE[stroke.tool];
  return getStroke(
    stroke.points.map(([x, y, p]) => [x, y, p]),
    {
      size: stroke.width * style.scale,
      thinning: style.thinning,
      smoothing: 0.5,
      streamline: 0.3,
      simulatePressure: false,
      last: complete,
    },
  );
}

/** Distance from point p to the segment a to b. */
function segmentDistance(px: number, py: number, a: InkPoint, b: InkPoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / length));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

/** Whether a stroke passes within `radius` of a point, allowing for its width. */
export function strokeHits(stroke: InkStroke, x: number, y: number, radius: number): boolean {
  const reach = radius + (stroke.width * TOOL_STYLE[stroke.tool].scale) / 2;
  const [first] = stroke.points;
  if (!first) return false;
  if (stroke.points.length === 1) return Math.hypot(x - first[0], y - first[1]) <= reach;
  for (let i = 1; i < stroke.points.length; i += 1) {
    const a = stroke.points[i - 1];
    const b = stroke.points[i];
    if (a && b && segmentDistance(x, y, a, b) <= reach) return true;
  }
  return false;
}
