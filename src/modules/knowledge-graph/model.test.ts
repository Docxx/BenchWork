// @vitest-environment node
import type { VaultGraph } from '@core/api';
import { DEFAULT_STYLE, graphModel, parseStyle, step } from './model';
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
