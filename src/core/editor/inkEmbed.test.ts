// @vitest-environment node
import type { InkStroke } from '../ink/inkFile';
import { grownHeight, roomAbove, shiftDown } from './inkEmbed';

const at = (y: number): InkStroke => ({
  id: 'a',
  tool: 'pen',
  colour: '#000000',
  width: 2,
  points: [
    [10, y, 0.5, 0],
    [40, y + 10, 0.5, 8],
  ],
});

describe('drawings in pages', () => {
  it('grow upwards when writing reaches above their top, so nothing is cut off', () => {
    expect(roomAbove([at(50)])).toBe(0);
    const dy = roomAbove([at(-10)]);
    expect(dy).toBeGreaterThan(10);
    const moved = shiftDown([at(-10)], dy);
    expect(roomAbove(moved)).toBe(0);
    expect(moved[0]?.points[0]?.[1]).toBe(-10 + dy);
  });

  it('grow downwards when writing nears their bottom', () => {
    expect(grownHeight(200, [at(20)])).toBe(200);
    expect(grownHeight(200, [at(180)])).toBeGreaterThan(200);
  });
});
