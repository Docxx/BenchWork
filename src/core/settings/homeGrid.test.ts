// @vitest-environment node
import { clampCell, compact, fillGrid, parseGrid, placeCard, readingOrder } from './homeGrid';

const size = () => ({ w: 4, h: 6 });

describe('the Home grid', () => {
  it('places new cards three to a row, in turn', () => {
    const grid = fillGrid({}, ['a', 'b', 'c', 'd'], size);
    expect(grid).toEqual({
      a: { x: 0, y: 0, w: 4, h: 6 },
      b: { x: 4, y: 0, w: 4, h: 6 },
      c: { x: 8, y: 0, w: 4, h: 6 },
      d: { x: 0, y: 6, w: 4, h: 6 },
    });
    expect(readingOrder(grid)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps cards where they were put, and adds new ones after them', () => {
    const grid = fillGrid({ b: { x: 0, y: 0, w: 12, h: 4 } }, ['a', 'b'], size);
    expect(grid).toEqual({ b: { x: 0, y: 0, w: 12, h: 4 }, a: { x: 0, y: 4, w: 4, h: 6 } });
  });

  it('moves a card, pushing what it covers down, and closing gaps', () => {
    const grid = fillGrid({}, ['a', 'b', 'c', 'd'], size);
    // d dragged to the top left: a moves down under it, the rest stay.
    const moved = placeCard(grid, 'd', { x: 0, y: 0, w: 4, h: 6 });
    expect(moved['d']).toEqual({ x: 0, y: 0, w: 4, h: 6 });
    expect(moved['a']).toEqual({ x: 0, y: 6, w: 4, h: 6 });
    expect(moved['b']?.y).toBe(0);
  });

  it('resizes a card, and keeps it inside the grid at a usable size', () => {
    const grid = fillGrid({}, ['a', 'b'], size);
    const wide = placeCard(grid, 'a', { x: 0, y: 0, w: 10, h: 6 });
    expect(wide['a']).toEqual({ x: 0, y: 0, w: 10, h: 6 });
    expect(wide['b']).toEqual({ x: 4, y: 6, w: 4, h: 6 });
    expect(clampCell({ x: 11, y: -3, w: 1, h: 0.4 })).toEqual({ x: 10, y: 0, w: 2, h: 3 });
  });

  it('lets cards rise into gaps', () => {
    expect(compact({ a: { x: 0, y: 9, w: 4, h: 3 } })).toEqual({ a: { x: 0, y: 0, w: 4, h: 3 } });
  });

  it('reads back only whole cells from settings', () => {
    expect(parseGrid({ a: { x: 1, y: 2, w: 5, h: 7 }, b: 'junk', c: { x: 1 } })).toEqual({
      a: { x: 1, y: 2, w: 5, h: 7 },
    });
    expect(parseGrid(null)).toEqual({});
  });
});
