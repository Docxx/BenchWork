import {
  blotLayout,
  blotPrims,
  blotTop,
  newBlot,
  newTable,
  parseBlot,
  parseTable,
  tableHeight,
  tableLayout,
  tablePrims,
  withCols,
  withLanes,
  type Blot,
} from './blot';
import type { Prim } from './scene';

const box = { x: 10, y: 20, w: 100, h: 50 };
const texts = (prims: Prim[]) =>
  prims.flatMap((p) => (p.kind === 'text' ? [p.runs.map((r) => r.text).join('')] : []));

const sample = (): Blot => ({
  ...newBlot(4),
  laneLabels: ['Mock', 'Drug', 'Mock', 'Drug'],
  groups: [{ id: 'g', text: 'Control', start: 0, span: 2 }],
  rows: [{ id: 'r', label: 'siRNA', cells: ['−', '−', '+', '+'] }],
  markers: [{ id: 'm', text: '62 kDa', at: 0.25 }],
  bands: [{ id: 'b', text: 'GAPDH', at: 0.5 }],
});

describe('blot labels', () => {
  it('spaces lanes evenly across the image, within where they start and end', () => {
    const l = blotLayout({ ...newBlot(4), from: 0.1, to: 0.9 }, box, 2.5);
    expect(l.lanes).toHaveLength(4);
    expect(l.laneWidth).toBeCloseTo((100 * 0.8) / 4);
    expect(l.lanes[0]).toBeCloseTo(10 + 10 + 10);
    expect(l.image).toEqual(box);
  });

  it('keeps room above the image for groups, names and conditions, and beside it for markers', () => {
    const l = blotLayout(sample(), box, 2.5);
    expect(l.image.y).toBeCloseTo(box.y + blotTop(sample(), 2.5));
    expect(l.image.y + l.image.h).toBeCloseTo(box.y + box.h);
    expect(l.image.x).toBeGreaterThan(box.x);
    expect(l.image.x + l.image.w).toBeLessThan(box.x + box.w);
    // Slanted names need more room than names read across.
    expect(blotTop({ ...sample(), laneAngle: 45 }, 2.5)).toBeGreaterThan(blotTop(sample(), 2.5));
  });

  it('draws names, conditions, markers and bands, with a rule under each group', () => {
    const b = sample();
    const l = blotLayout(b, box, 2.5);
    const prims = blotPrims(b, l, 2.5);
    expect(texts(prims)).toEqual(
      expect.arrayContaining(['Control', 'Mock', 'Drug', 'siRNA', '+', '−', '62 kDa', 'GAPDH']),
    );
    const marker = prims.find((p) => p.kind === 'text' && p.runs[0]?.text === '62 kDa');
    expect(marker?.kind === 'text' && marker.y).toBeCloseTo(l.image.y + l.image.h * 0.25);
    expect(prims.filter((p) => p.kind === 'line').length).toBe(2);
  });

  it('slants lane names from the bottom of their row', () => {
    const b = { ...sample(), laneAngle: 45 as const };
    const prims = blotPrims(b, blotLayout(b, box, 2.5), 2.5);
    const name = prims.find((p) => p.kind === 'text' && p.runs[0]?.text === 'Mock');
    expect(name?.kind === 'text' && name.rotate).toBe(45);
  });

  it('keeps names and values when lanes are added or taken away', () => {
    const more = withLanes(sample(), 6);
    expect(more.laneLabels).toEqual(['Mock', 'Drug', 'Mock', 'Drug', '', '']);
    expect(more.rows[0]?.cells).toHaveLength(6);
    const fewer = withLanes(
      { ...sample(), groups: [{ id: 'g', text: 'x', start: 1, span: 3 }] },
      2,
    );
    expect(fewer.groups[0]?.span).toBe(1);
  });

  it('reads back what it wrote, and fixes odd values', () => {
    expect(parseBlot(JSON.parse(JSON.stringify(sample())))).toEqual(sample());
    const odd = parseBlot({ lanes: 3, from: 2, laneAngle: 30, markers: [{ text: 'x', at: 9 }] });
    expect(odd?.from).toBe(0.9);
    expect(odd?.laneAngle).toBe(0);
    expect(odd?.markers[0]?.at).toBe(1);
    expect(parseBlot(null)).toBeNull();
  });
});

describe('a table on its own', () => {
  it('puts names in a column and values evenly across the rest', () => {
    const t = newTable(4);
    const l = tableLayout(t, box);
    expect(l.cols).toHaveLength(4);
    expect(l.cols[0]).toBeGreaterThan(box.x + l.nameW);
    expect((l.cols[3] ?? 0) - (l.cols[2] ?? 0)).toBeCloseTo((l.cols[1] ?? 0) - (l.cols[0] ?? 0));
    expect(texts(tablePrims(t, box))).toEqual([
      'Drug',
      '−',
      '+',
      '−',
      '+',
      'siRNA',
      '−',
      '−',
      '+',
      '+',
    ]);
  });

  it('is as tall as its rows, and keeps cells when columns change', () => {
    const t = newTable(4);
    expect(tableHeight({ ...t, rows: [...t.rows, ...t.rows] })).toBeGreaterThan(
      tableHeight(t) * 1.8,
    );
    expect(withCols(t, 2).rows[0]?.cells).toEqual(['−', '+']);
    expect(parseTable({ cols: 2, rows: [{ label: 'A', cells: ['+'] }] }).rows[0]?.cells).toEqual([
      '+',
      '',
    ]);
  });
});
