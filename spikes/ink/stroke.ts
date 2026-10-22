/**
 * Strokes in the shape SPEC.md gives for `.ink.json`: points with x, y,
 * pressure and time. The spike keeps them in memory only, to measure how big
 * a dense page would be on disk. The real format is decided in Phase 4.
 */

export interface InkPoint {
  /** CSS pixels from the top left of the ink area. */
  x: number;
  y: number;
  /** 0 to 1. Mice and fingers report no real pressure, so they get 0.5. */
  pressure: number;
  /** Milliseconds since the stroke began. */
  t: number;
}

export type InkSource = 'pen' | 'touch' | 'mouse';

export interface InkStroke {
  tool: 'pen';
  colour: string;
  /** Base width in CSS pixels, before pressure. */
  width: number;
  /** What drew it. Not part of the planned format; kept for the spike's stats. */
  source: InkSource;
  points: InkPoint[];
}

export interface InkFile {
  version: 1;
  strokes: InkStroke[];
  recognisedText: string | null;
}

export interface RawPoint {
  x: number;
  y: number;
  pressure: number;
  /** Event time in milliseconds (performance.now() time base). */
  time: number;
}

/** Pressure as stored: real for pens, 0.5 for everything else. */
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

  begin(source: InkSource, colour: string, width: number, first: RawPoint): void {
    this.start = first.time;
    this.stroke = { tool: 'pen', colour, width, source, points: [] };
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
      const point: InkPoint = {
        x: round(s.x, 2),
        y: round(s.y, 2),
        pressure: round(s.pressure, 3),
        t: Math.max(0, Math.round(s.time - this.start)),
      };
      const last = stroke.points.at(-1);
      if (last && last.x === point.x && last.y === point.y) continue;
      stroke.points.push(point);
    }
  }

  /** Finishes the stroke and returns it. */
  end(): InkStroke | null {
    const stroke = this.stroke;
    this.stroke = null;
    return stroke;
  }

  /** Drops the stroke, for example when a palm turns out to be a palm. */
  cancel(): void {
    this.stroke = null;
  }
}

export function toInkFile(strokes: readonly InkStroke[]): InkFile {
  return { version: 1, strokes: [...strokes], recognisedText: null };
}

/** Size in bytes of the strokes saved as compact JSON (UTF-8). */
export function inkFileBytes(strokes: readonly InkStroke[]): number {
  return new TextEncoder().encode(JSON.stringify(toInkFile(strokes))).length;
}
