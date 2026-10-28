// @vitest-environment node
import type { InkPoint, InkStroke } from '@core/api';
import { recognise, snapShape } from './shapes';

/** A hand-drawn path: points along `fn` from 0 to 1, with a little wobble. */
function drawn(fn: (t: number) => [number, number], count = 60, wobble = 1.5): InkPoint[] {
  return Array.from({ length: count }, (_, i): InkPoint => {
    const [x, y] = fn(i / (count - 1));
    const jitter = Math.sin(i * 1.7) * wobble;
    return [x + jitter, y - jitter, 0.5, i * 10];
  });
}

const stroke = (points: InkPoint[]): InkStroke => ({
  id: 'abc',
  tool: 'pen',
  colour: '#2f5fb3',
  width: 2,
  points,
});

/** Round the edge of a 200 by 100 box, starting at its top left. */
function aroundBox(t: number): [number, number] {
  const d = t * 600;
  if (d < 200) return [d, 0];
  if (d < 300) return [200, d - 200];
  if (d < 500) return [200 - (d - 300), 100];
  return [0, 100 - (d - 500)];
}

describe('shapes', () => {
  it('know a rough line, rectangle and ellipse', () => {
    expect(recognise(drawn((t) => [t * 300, t * 40]))).toBe('line');
    expect(recognise(drawn(aroundBox, 120))).toBe('rectangle');
    expect(
      recognise(
        drawn((t) => [100 + 90 * Math.cos(t * Math.PI * 2), 60 + 50 * Math.sin(t * Math.PI * 2)]),
      ),
    ).toBe('ellipse');
  });

  it('know shapes drawn as people draw them: wobbly, rounded, running past the start', () => {
    // Round a box with rounded corners, then on past the start.
    const rough = (t: number): [number, number] => {
      const [x, y] = aroundBox((t * 1.1) % 1);
      const corner = Math.min(x, 200 - x, y, 100 - y) < 12 ? 6 : 0;
      return [x + (x < 100 ? corner : -corner), y + (y < 50 ? corner : -corner)];
    };
    expect(recognise(drawn(rough, 140, 4))).toBe('rectangle');
    const oval = (t: number): [number, number] => {
      const a = t * Math.PI * 2.15;
      return [100 + 90 * Math.cos(a) + Math.sin(a * 5) * 4, 60 + 50 * Math.sin(a)];
    };
    expect(recognise(drawn(oval, 90, 3))).toBe('ellipse');
  });

  it('leave scribbles, writing and small marks alone', () => {
    // A zigzag, like handwriting.
    expect(recognise(drawn((t) => [t * 200, (Math.floor(t * 12) % 2) * 40], 80, 0))).toBeNull();
    // An open curve.
    expect(recognise(drawn((t) => [t * 200, Math.sin(t * Math.PI) * 120]))).toBeNull();
    // A dot.
    expect(recognise(drawn((t) => [t * 5, t * 5]))).toBeNull();
  });

  it('keep the stroke’s id, colour and width, tidied into even points', () => {
    const tidy = snapShape(stroke(drawn((t) => [10 + t * 300, 20 + t * 40])));
    expect(tidy).toMatchObject({ id: 'abc', colour: '#2f5fb3', width: 2, tool: 'pen' });
    const points = tidy?.points ?? [];
    expect(points[0]?.slice(0, 2)).toEqual([10, 20]);
    // Every point lies on the straight line from start to end.
    for (const [x, y] of points)
      expect(Math.abs(y - (20 + ((x - 10) * 40) / 300))).toBeLessThan(0.5);
    expect(
      snapShape(stroke(drawn((t) => [t * 200, (Math.floor(t * 12) % 2) * 40], 80, 0))),
    ).toBeNull();
  });
});
