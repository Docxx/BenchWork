// @vitest-environment node
import { stressStrokes } from './stress';
import { inkFileBytes, StrokeRecorder, strokePressure, toInkFile } from './stroke';

describe('stroke recorder', () => {
  it('records points relative to the stroke start, rounded', () => {
    const r = new StrokeRecorder();
    r.begin('pen', '#000', 3, { x: 1.23456, y: 2.5, pressure: 0.33333, time: 1000.4 });
    r.add([{ x: 5, y: 6, pressure: 0.5, time: 1004.6 }]);
    expect(r.end()?.points).toEqual([
      { x: 1.23, y: 2.5, pressure: 0.333, t: 0 },
      { x: 5, y: 6, pressure: 0.5, t: 4 },
    ]);
  });

  it('skips samples that repeat the last position', () => {
    const r = new StrokeRecorder();
    r.begin('pen', '#000', 3, { x: 1, y: 1, pressure: 0.5, time: 0 });
    r.add([
      { x: 1, y: 1, pressure: 0.6, time: 4 },
      { x: 2, y: 1, pressure: 0.6, time: 8 },
    ]);
    expect(r.end()?.points).toHaveLength(2);
  });

  it('drops a cancelled stroke and ignores samples without one', () => {
    const r = new StrokeRecorder();
    r.add([{ x: 1, y: 1, pressure: 0.5, time: 0 }]);
    expect(r.current).toBeNull();
    r.begin('touch', '#000', 3, { x: 1, y: 1, pressure: 0.5, time: 0 });
    r.cancel();
    expect(r.end()).toBeNull();
  });

  it('uses real pressure only for pens', () => {
    expect(strokePressure('pen', 0.8)).toBe(0.8);
    expect(strokePressure('pen', 1.4)).toBe(1);
    expect(strokePressure('mouse', 0)).toBe(0.5);
    expect(strokePressure('touch', 1)).toBe(0.5);
  });
});

describe('ink files', () => {
  it('use the SPEC shape', () => {
    expect(toInkFile([])).toEqual({ version: 1, strokes: [], recognisedText: null });
  });

  it('measure their size in bytes', () => {
    expect(inkFileBytes([])).toBe(JSON.stringify(toInkFile([])).length);
  });
});

describe('stress strokes', () => {
  it('are the same every time and stay inside the area', () => {
    const a = stressStrokes(200, 800, 1200);
    expect(a).toEqual(stressStrokes(200, 800, 1200));
    expect(a).toHaveLength(200);
    for (const p of a.flatMap((s) => s.points)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(800);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1200);
    }
  });
});
