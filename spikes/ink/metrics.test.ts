// @vitest-environment node
import { longFrames, percentile, sampleRate, Series } from './metrics';
import { simpleWidth, strokeBounds, unionRect } from './render';

describe('metrics', () => {
  it('take nearest-rank percentiles', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(values, 50)).toBe(5);
    expect(percentile(values, 95)).toBe(10);
    expect(percentile(values, 0)).toBe(1);
    expect(percentile([], 50)).toBeNull();
  });

  it('summarise a series and keep only the latest values', () => {
    const s = new Series(3);
    for (const v of [100, 1, 2, 3, Number.NaN]) s.add(v);
    expect(s.summary()).toEqual({ count: 3, median: 2, p95: 3, max: 3 });
    s.clear();
    expect(s.summary()).toEqual({ count: 0, median: null, p95: null, max: null });
  });

  it('count frames well over the usual interval as slow', () => {
    expect(longFrames([8.3, 8.4, 8.3, 16.7, 8.3, 30])).toBe(2);
    expect(longFrames([])).toBe(0);
  });

  it('work out pen samples per second', () => {
    expect(sampleRate([{ t: 0 }, { t: 4 }, { t: 8 }])).toBe(250);
    expect(sampleRate([{ t: 0 }])).toBeNull();
  });
});

describe('drawing helpers', () => {
  it('scale line width with pressure, 0.5 giving the base width', () => {
    expect(simpleWidth(3, 0.5)).toBeCloseTo(3);
    expect(simpleWidth(3, 0)).toBeCloseTo(0.9);
  });

  it('bound a stroke with room for its widest line', () => {
    const b = strokeBounds(
      [
        { x: 10, y: 20, pressure: 0.5, t: 0 },
        { x: 30, y: 5, pressure: 0.5, t: 4 },
      ],
      2,
    );
    expect(b).not.toBeNull();
    if (!b) return;
    expect(b.x).toBeLessThan(10);
    expect(b.y).toBeLessThan(5);
    expect(b.x + b.w).toBeGreaterThan(30);
    expect(b.y + b.h).toBeGreaterThan(20);
    expect(strokeBounds([], 2)).toBeNull();
  });

  it('join rectangles', () => {
    expect(unionRect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: -5, w: 10, h: 5 })).toEqual({
      x: 0,
      y: -5,
      w: 15,
      h: 15,
    });
    expect(unionRect(null, null)).toBeNull();
  });
});
