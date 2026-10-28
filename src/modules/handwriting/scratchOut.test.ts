// @vitest-environment node
import type { InkPoint, InkStroke } from '@core/api';
import { isScribble, scribbledOver } from './scratchOut';

const stroke = (id: string, points: InkPoint[]): InkStroke => ({
  id,
  tool: 'pen',
  colour: '#1d2725',
  width: 2,
  points,
});

/** Back and forth `turns` times across x from 0 to 120, drifting down a little. */
function scribble(turns: number, x0 = 0, y0 = 40): InkPoint[] {
  const points: InkPoint[] = [];
  for (let leg = 0; leg <= turns; leg += 1) {
    for (let i = 0; i <= 6; i += 1) {
      const x = leg % 2 === 0 ? (i * 120) / 6 : 120 - (i * 120) / 6;
      points.push([x0 + x, y0 + leg * 2 + (i % 2), 0.5, points.length * 8]);
    }
  }
  return points;
}

/** A word: a short wavy line. */
const word = (id: string, x: number, y: number) =>
  stroke(
    id,
    Array.from({ length: 20 }, (_, i): InkPoint => [x + i * 3, y + Math.sin(i) * 5, 0.5, i * 8]),
  );

describe('scratching out', () => {
  it('knows a scribble from writing and lines', () => {
    expect(isScribble(scribble(5))).toBe(true);
    expect(isScribble(scribble(2))).toBe(false);
    expect(isScribble(word('w', 0, 0).points)).toBe(false);
    expect(
      isScribble(Array.from({ length: 30 }, (_, i): InkPoint => [i * 10, 20, 0.5, i * 8])),
    ).toBe(false);
  });

  it('erases the strokes mostly under the scribble, and nothing else', () => {
    const others = [word('under', 20, 45), word('beside', 300, 45), word('half', 100, 45)];
    const ids = scribbledOver(stroke('s', scribble(5)), others);
    expect(ids).toContain('under');
    expect(ids).not.toContain('beside');
    expect(scribbledOver(stroke('s', scribble(5, 500)), others)).toEqual([]);
  });
});
