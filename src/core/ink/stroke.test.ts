// @vitest-environment node
import type { InkStroke } from './inkFile';
import { StrokeRecorder, strokeHits, strokeOutline, strokePressure } from './stroke';

describe('stroke recorder', () => {
  it('records points relative to the stroke start, rounded, with an id', () => {
    const r = new StrokeRecorder();
    r.begin('pen', '#000000', 3, { x: 1.23456, y: 2.5, pressure: 0.33333, time: 1000.4 });
    r.add([{ x: 5, y: 6, pressure: 0.5, time: 1004.6 }]);
    const stroke = r.end();
    expect(stroke?.id).toMatch(/^[a-z0-9]{8}$/);
    expect(stroke?.points).toEqual([
      [1.23, 2.5, 0.333, 0],
      [5, 6, 0.5, 4],
    ]);
  });

  it('skips samples that repeat the last position, and drops a cancelled stroke', () => {
    const r = new StrokeRecorder();
    r.begin('highlighter', '#000000', 3, { x: 1, y: 1, pressure: 0.5, time: 0 });
    r.add([
      { x: 1, y: 1, pressure: 0.6, time: 4 },
      { x: 2, y: 1, pressure: 0.6, time: 8 },
    ]);
    expect(r.current?.points).toHaveLength(2);
    r.cancel();
    expect(r.end()).toBeNull();
  });

  it('keeps real pressure only for pens', () => {
    expect(strokePressure('pen', 0.8)).toBe(0.8);
    expect(strokePressure('pen', 1.4)).toBe(1);
    expect(strokePressure('mouse', 0)).toBe(0.5);
    expect(strokePressure('touch', 1)).toBe(0.5);
  });
});

describe('strokes on screen', () => {
  const line: InkStroke = {
    id: 'a',
    tool: 'pen',
    colour: '#000000',
    width: 2,
    points: [
      [0, 0, 0.5, 0],
      [100, 0, 0.5, 10],
    ],
  };

  it('have an outline to fill', () => {
    expect(strokeOutline(line).length).toBeGreaterThan(4);
  });

  it('are hit by the eraser near their line, allowing for their width', () => {
    expect(strokeHits(line, 50, 3, 2)).toBe(true);
    expect(strokeHits(line, 50, 10, 2)).toBe(false);
    expect(strokeHits(line, 110, 0, 2)).toBe(false);
    expect(strokeHits({ ...line, points: [[5, 5, 0.5, 0]] }, 7, 5, 1)).toBe(true);
  });
});
