// @vitest-environment node
import type { InkStroke } from '@core/api';
import {
  boxOf,
  inBox,
  insideLoop,
  moveStrokes,
  recolourStrokes,
  strokesInLoop,
  withoutStrokes,
} from './lasso';

const line = (id: string, x: number, y: number): InkStroke => ({
  id,
  tool: 'pen',
  colour: '#1d2725',
  width: 2,
  points: [
    [x, y, 0.5, 0],
    [x + 20, y, 0.5, 10],
    [x + 40, y, 0.5, 20],
  ],
});

const STROKES = [line('a', 10, 10), line('b', 10, 100), line('c', 200, 10)];
/** A loop round the left half of the drawing. */
const LOOP = [
  { x: 0, y: 0 },
  { x: 120, y: 0 },
  { x: 120, y: 150 },
  { x: 0, y: 150 },
];

describe('the lasso', () => {
  it('chooses the strokes mostly inside its loop', () => {
    expect(insideLoop(LOOP, 50, 50)).toBe(true);
    expect(insideLoop(LOOP, 150, 50)).toBe(false);
    expect([...strokesInLoop(STROKES, LOOP)]).toEqual(['a', 'b']);
    // A stroke only partly inside is left out.
    expect(strokesInLoop([line('d', 100, 10)], LOOP).size).toBe(0);
    expect(strokesInLoop(STROKES, LOOP.slice(0, 2)).size).toBe(0);
  });

  it('moves, recolours and deletes only the chosen strokes', () => {
    const chosen = new Set(['a']);
    const moved = moveStrokes(STROKES, chosen, 5, -3);
    expect(moved[0]?.points[0]).toEqual([15, 7, 0.5, 0]);
    expect(moved[1]).toBe(STROKES[1]);
    expect(recolourStrokes(STROKES, chosen, '#c0392b').map((s) => s.colour)).toEqual([
      '#c0392b',
      '#1d2725',
      '#1d2725',
    ]);
    expect(withoutStrokes(STROKES, chosen).map((s) => s.id)).toEqual(['b', 'c']);
  });

  it('knows the area the chosen strokes cover, to drag them by', () => {
    const box = boxOf(STROKES, new Set(['a', 'b']));
    expect(box).toEqual({ x: 0, y: 0, w: 60, h: 110 });
    expect(inBox(box, 30, 50)).toBe(true);
    expect(inBox(box, 100, 50)).toBe(false);
    expect(boxOf(STROKES, new Set())).toBeNull();
  });
});
