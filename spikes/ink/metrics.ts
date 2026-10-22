/**
 * Latency and sample-rate measurements the page can take by itself. They
 * cover input to code and code to frame, not the screen's own delay, which
 * only the slow-motion video in RESULTS.md can measure.
 */

export interface Summary {
  count: number;
  median: number | null;
  p95: number | null;
  max: number | null;
}

/** Nearest-rank percentile of sorted values, `p` from 0 to 100. */
export function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))] ?? null;
}

/** Keeps the last `limit` values of one measurement. */
export class Series {
  private values: number[] = [];

  constructor(private readonly limit = 5000) {}

  add(value: number): void {
    if (!Number.isFinite(value)) return;
    this.values.push(value);
    if (this.values.length > this.limit) this.values.splice(0, this.values.length - this.limit);
  }

  summary(): Summary {
    const sorted = [...this.values].sort((a, b) => a - b);
    return {
      count: sorted.length,
      median: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      max: sorted.at(-1) ?? null,
    };
  }

  clear(): void {
    this.values = [];
  }
}

/** Frames much slower than the screen's usual rate. */
export function longFrames(intervals: readonly number[], factor = 1.5): number {
  const sorted = [...intervals].sort((a, b) => a - b);
  const typical = percentile(sorted, 50);
  if (typical === null) return 0;
  return intervals.filter((i) => i > typical * factor).length;
}

/** Pen samples per second over a stroke, from its first to last point time. */
export function sampleRate(points: readonly { t: number }[]): number | null {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last || last.t <= first.t) return null;
  return ((points.length - 1) * 1000) / (last.t - first.t);
}

export interface SpikeMetrics {
  /** Event time to the handler running. */
  inputToHandler: Series;
  /** Handler to the end of drawing in the next frame. */
  handlerToDrawn: Series;
  /** Event time to the end of drawing; the sum of the two above, per event. */
  inputToDrawn: Series;
  /** Samples per second, one value per pen stroke. */
  penSampleRate: Series;
  /** Gaps between frames while drawing. */
  frameIntervals: number[];
  /** Time to redraw every finished stroke, once per full redraw. */
  fullRedraw: Series;
}

export function createMetrics(): SpikeMetrics {
  return {
    inputToHandler: new Series(),
    handlerToDrawn: new Series(),
    inputToDrawn: new Series(),
    penSampleRate: new Series(),
    frameIntervals: [],
    fullRedraw: new Series(100),
  };
}

export function resetMetrics(m: SpikeMetrics): void {
  m.inputToHandler.clear();
  m.handlerToDrawn.clear();
  m.inputToDrawn.clear();
  m.penSampleRate.clear();
  m.frameIntervals.length = 0;
  m.fullRedraw.clear();
}
