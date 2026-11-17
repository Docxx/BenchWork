// @vitest-environment node
import type { VaultGraph } from '@core/api';
import {
  DEFAULT_FILTERS,
  DEFAULT_STYLE,
  graphModel,
  graphSignature,
  keepPlaces,
  parseStyle,
  parseView,
  step,
} from './model';
const data: VaultGraph = {
  nodes: [
    { id: 'a', path: 'a.md', title: 'Alpha', kind: 'note', tags: ['lab'] },
    { id: 'b', path: 'b.pdf', title: 'Beta', kind: 'document', tags: ['lab'] },
    { id: 'c', path: 'c.md', title: 'Unconnected', kind: 'note', tags: [] },
  ],
  edges: [],
  warnings: [],
};
it('connects files through shared tags and can hide unconnected files', () => {
  const model = graphModel(data, { ...DEFAULT_STYLE, orphans: false }, '', '', null);
  expect(model.nodes.map((n) => n.id).sort()).toEqual(['#lab', 'a', 'b']);
  expect(model.edges).toHaveLength(2);
  expect(
    graphModel(data, { ...DEFAULT_STYLE, tags: false, orphans: false }, '', '', null).nodes,
  ).toHaveLength(0);
});
it('filters the local two-hop neighbourhood and text or tag matches', () => {
  expect(
    graphModel(data, DEFAULT_STYLE, '', '', 'a')
      .nodes.map((n) => n.id)
      .sort(),
  ).toEqual(['#lab', 'a', 'b']);
  expect(
    graphModel(data, DEFAULT_STYLE, 'Beta', 'lab', null)
      .nodes.map((n) => n.id)
      .sort(),
  ).toEqual(['#lab', 'b']);
});
it('validates saved settings and keeps the force layout finite', () => {
  const style = parseStyle({
    size: Infinity,
    spacing: -1,
    opacity: 9,
    palette: 'invalid',
    labels: 'yes',
  });
  expect(style).toEqual({ ...DEFAULT_STYLE, spacing: 40, opacity: 1 });
  const model = graphModel(data, style, '', '', null);
  for (let i = 0; i < 100; i++) step(model, style.spacing);
  expect(model.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
});
it('draws a connection once and separates unconnected groups in two dimensions', () => {
  const model = graphModel(
    {
      ...data,
      edges: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'a' },
        { source: 'a', target: 'a' },
      ],
    },
    { ...DEFAULT_STYLE, tags: false },
    '',
    '',
    null,
  );
  expect(model.edges).toHaveLength(1);
  expect(model.nodes.find((n) => n.id === 'a')?.degree).toBe(1);
  const isolated = model.nodes.find((n) => n.id === 'c');
  const linked = model.nodes.find((n) => n.id === 'a');
  expect(
    Math.hypot((isolated?.x ?? 0) - (linked?.x ?? 0), (isolated?.y ?? 0) - (linked?.y ?? 0)),
  ).toBeGreaterThan(DEFAULT_STYLE.spacing);
});

describe('the saved view', () => {
  it('reads style, filters and named looks, and an older style-only file', () => {
    const view = parseView({
      style: { palette: 'ember', live: false, speed: 9 },
      filters: { folder: 'Lab', kind: 'note', tag: 'flies' },
      presets: [{ name: ' Calm ', style: { glow: false } }, { name: '' }],
      panel: true,
    });
    expect(view.style).toMatchObject({ palette: 'ember', live: false, speed: 3 });
    expect(view.filters).toEqual({ folder: 'Lab', kind: 'note', tag: 'flies' });
    expect(view.presets.map((p) => [p.name, p.style.glow])).toEqual([['Calm', false]]);
    expect(view.panel).toBe(true);

    const old = parseView({ palette: 'violet', motion: false });
    expect(old.style).toMatchObject({ palette: 'violet', motion: false });
    expect(old.filters).toEqual(DEFAULT_FILTERS);
    expect(parseView(null).style).toEqual(DEFAULT_STYLE);
  });
});
it('sees a reload with no new links or tags as the same graph', () => {
  const same = { ...data, nodes: data.nodes.map((n) => ({ ...n })).reverse() };
  expect(graphSignature(same)).toBe(graphSignature(data));
  const tagged = {
    ...data,
    nodes: data.nodes.map((n) => (n.id === 'c' ? { ...n, tags: ['lab'] } : n)),
  };
  expect(graphSignature(tagged)).not.toBe(graphSignature(data));
  expect(graphSignature({ ...data, edges: [{ source: 'a', target: 'c' }] })).not.toBe(
    graphSignature(data),
  );
});
it('keeps nodes where they were, settling only new ones beside them', () => {
  const first = graphModel(data, DEFAULT_STYLE, '', '', null);
  for (let i = 0; i < 50; i++) step(first, DEFAULT_STYLE.spacing);
  const places = new Map(first.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  const grown: typeof data = {
    ...data,
    nodes: [...data.nodes, { id: 'd', path: 'd.md', title: 'New', kind: 'note', tags: ['lab'] }],
  };
  const next = graphModel(grown, DEFAULT_STYLE, '', '', null);
  expect(keepPlaces(next, places, DEFAULT_STYLE.spacing)).toBe(first.nodes.length);
  for (const n of next.nodes) {
    const was = places.get(n.id);
    if (was) expect({ x: n.x, y: n.y }).toEqual(was);
  }
  const added = next.nodes.find((n) => n.id === 'd');
  expect(Number.isFinite(added?.x)).toBe(true);
  // The options bar is hidden unless it was left open.
  expect(parseView({}).options).toBe(false);
  expect(parseView({ options: true }).options).toBe(true);
});
