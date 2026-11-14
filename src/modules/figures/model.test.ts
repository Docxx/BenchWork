// @vitest-environment node
import {
  fillWith,
  inReadingOrder,
  insertLine,
  layout,
  letter,
  merge,
  newGrid,
  panelAt,
  parseGrid,
  removeLine,
  serialiseFigure,
  sourceRect,
  split,
  DEFAULT_CROP,
} from './model';

describe('a new figure', () => {
  it('is a grid of empty panels across the page, with square cells', () => {
    const f = newGrid(2, 3, 174);
    expect(f.panels).toHaveLength(6);
    const l = layout(f);
    expect(l.width).toBe(174);
    const [a, b] = l.panels;
    expect(a?.w).toBeCloseTo((174 - 4) / 3);
    expect(b?.x).toBeCloseTo((174 - 4) / 3 + 2);
    expect(a?.h).toBeCloseTo(56.7, 1);
    expect(l.height).toBeCloseTo(56.7 * 2 + 2, 1);
  });

  it('makes room for labels when there are some', () => {
    const f = { ...newGrid(1, 2, 100), rowLabels: ['w1118'], colLabels: ['DAPI', 'Tau'] };
    const l = layout(f);
    expect(l.grid.x).toBeGreaterThan(0);
    expect(l.grid.y).toBeGreaterThan(0);
    expect(l.panels[0]?.x).toBe(l.grid.x);
    expect(panelAt(l, l.grid.x + 1, l.grid.y + 1)?.panel.col).toBe(0);
    expect(panelAt(l, 0.5, 0.5)).toBeNull();
  });
});

describe('cropping', () => {
  it('fills a panel, keeping the image’s shape', () => {
    // A wide image in a square panel shows its middle.
    expect(sourceRect({ w: 2000, h: 1000 }, { w: 50, h: 50 }, DEFAULT_CROP)).toEqual({
      x: 500,
      y: 0,
      w: 1000,
      h: 1000,
    });
    // Zoomed in twice, towards the top left, but never past the edge.
    expect(
      sourceRect(
        { w: 2000, h: 1000 },
        { w: 50, h: 50 },
        { ...DEFAULT_CROP, zoom: 2, cx: 0, cy: 0 },
      ),
    ).toEqual({ x: 0, y: 0, w: 500, h: 500 });
  });

  it('swaps the panel’s shape for a quarter turn', () => {
    const r = sourceRect({ w: 1000, h: 1000 }, { w: 100, h: 50 }, { ...DEFAULT_CROP, turns: 1 });
    expect(r).toEqual({ x: 250, y: 0, w: 500, h: 1000 });
  });
});

describe('changing the grid', () => {
  it('adds and removes rows and columns, keeping images', () => {
    let f = fillWith(newGrid(2, 2), ['a.png', 'b.png', 'c.png', 'd.png']);
    f = insertLine(f, 'col', 0);
    expect(f.cols).toHaveLength(3);
    expect(f.panels.filter((p) => p.col === 1).every((p) => p.image === null)).toBe(true);
    expect(f.panels.find((p) => p.row === 0 && p.col === 2)?.image?.path).toBe('b.png');
    f = removeLine(f, 'col', 1);
    expect(f.panels.map((p) => p.image?.path)).toEqual(['a.png', 'b.png', 'c.png', 'd.png']);
    expect(removeLine(newGrid(1, 1), 'row', 0).rows).toHaveLength(1);
  });

  it('merges a block into one panel, and splits it again', () => {
    const f = fillWith(newGrid(2, 2), ['a.png']);
    const merged = merge(f, { row: 0, col: 0, rowSpan: 2, colSpan: 1 });
    expect(merged?.panels).toHaveLength(3);
    const big = merged?.panels.find((p) => p.rowSpan === 2);
    expect(big?.image?.path).toBe('a.png');
    expect(layout(merged ?? f).panels.find((p) => p.panel.rowSpan === 2)?.h).toBeCloseTo(
      (f.rows[0] ?? 0) * 2 + f.gap,
    );
    // A block cutting through the tall panel is refused.
    expect(merge(merged ?? f, { row: 1, col: 0, rowSpan: 1, colSpan: 2 })).toBeNull();
    expect(split(merged ?? f, big?.id ?? '').panels).toHaveLength(4);
  });

  it('fills empty panels in reading order from the one dropped on', () => {
    let f = fillWith(newGrid(2, 2), ['a.png']);
    const second = f.panels[1]?.id;
    f = fillWith(f, ['b.png', 'c.png', 'd.png', 'e.png'], second);
    expect(f.panels.slice(0, 4).map((p) => p.image?.path)).toEqual([
      'a.png',
      'b.png',
      'c.png',
      'd.png',
    ]);
    // The fifth has no room, so a new row is added for it.
    expect(f.rows).toHaveLength(3);
    expect(
      inReadingOrder(f.panels)
        .slice(4)
        .map((p) => p.image?.path ?? null),
    ).toEqual(['e.png', null]);
  });
});

describe('reading and writing', () => {
  it('survives a round trip, and repairs odd files', () => {
    const f = fillWith(newGrid(2, 2), ['a.png']);
    expect(parseGrid(serialiseFigure(f))).toEqual(f);
    const odd = parseGrid(
      JSON.stringify({
        rows: [40],
        cols: [1, 1],
        panels: [{ row: 5, col: 0 }],
        letters: { size: 99 },
      }),
    );
    expect(odd?.panels).toHaveLength(2);
    expect(odd?.letters.size).toBe(36);
    expect(parseGrid('{"rows": []}')).toBeNull();
    expect(parseGrid('nonsense')).toBeNull();
  });

  it('letters panels A to Z, then AA', () => {
    expect([0, 1, 25, 26].map((i) => letter(i, 'upper'))).toEqual(['A', 'B', 'Z', 'AA']);
    expect(letter(2, 'brackets')).toBe('(c)');
  });
});
