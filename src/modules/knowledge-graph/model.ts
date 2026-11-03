import type { VaultGraph } from '@core/api';

export interface GraphStyle {
  palette: 'aurora' | 'ember' | 'violet' | 'theme';
  colourBy: 'notebook' | 'kind' | 'tag';
  labels: boolean;
  tags: boolean;
  orphans: boolean;
  glow: boolean;
  motion: boolean;
  size: number;
  spacing: number;
  opacity: number;
}
export const DEFAULT_STYLE: GraphStyle = {
  palette: 'aurora',
  colourBy: 'notebook',
  labels: true,
  tags: true,
  orphans: true,
  glow: true,
  motion: false,
  size: 5,
  spacing: 110,
  opacity: 0.3,
};
export function parseStyle(value: unknown): GraphStyle {
  const style = { ...DEFAULT_STYLE };
  if (!value || typeof value !== 'object') return style;
  const data = value as Record<string, unknown>;
  if (['aurora', 'ember', 'violet', 'theme'].includes(String(data['palette'])))
    style.palette = data['palette'] as GraphStyle['palette'];
  if (['notebook', 'kind', 'tag'].includes(String(data['colourBy'])))
    style.colourBy = data['colourBy'] as GraphStyle['colourBy'];
  for (const key of ['labels', 'tags', 'orphans', 'glow', 'motion'] as const)
    if (typeof data[key] === 'boolean') style[key] = data[key];
  for (const [key, min, max] of [
    ['size', 2, 12],
    ['spacing', 40, 240],
    ['opacity', 0.05, 1],
  ] as const) {
    const n = data[key];
    if (typeof n === 'number' && Number.isFinite(n)) style[key] = Math.max(min, Math.min(max, n));
  }
  return style;
}
export interface GraphPoint {
  id: string;
  path: string | null;
  title: string;
  group: string;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number;
}
export interface GraphModel {
  nodes: GraphPoint[];
  edges: { source: GraphPoint; target: GraphPoint }[];
}

export function graphModel(
  data: VaultGraph,
  style: GraphStyle,
  query: string,
  tag: string,
  focus: string | null,
): GraphModel {
  const q = query.trim().toLowerCase();
  const files = data.nodes.filter(
    (n) =>
      (!q || `${n.title} ${n.path} ${n.tags.join(' ')}`.toLowerCase().includes(q)) &&
      (!tag || n.tags.includes(tag)),
  );
  const points: GraphPoint[] = files.map((n) => ({
    id: n.id,
    path: n.path,
    title: n.title,
    kind: n.kind,
    group:
      style.colourBy === 'kind'
        ? n.kind
        : style.colourBy === 'tag'
          ? (n.tags[0] ?? 'Untagged')
          : (n.path.split('/')[0] ?? 'Vault'),
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    degree: 0,
  }));
  const byId = new Map(points.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const edges = data.edges.flatMap((e) => {
    const key = [e.source, e.target].sort().join('\n');
    if (e.source === e.target || seen.has(key)) return [];
    seen.add(key);
    const source = byId.get(e.source);
    const target = byId.get(e.target);
    return source && target ? [{ source, target }] : [];
  });
  if (style.tags)
    for (const file of files)
      for (const t of file.tags) {
        const id = `#${t}`;
        let point = byId.get(id);
        if (!point) {
          point = {
            id,
            path: null,
            title: id,
            kind: 'tag',
            group: 'Tags',
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            degree: 0,
          };
          byId.set(id, point);
          points.push(point);
        }
        const source = byId.get(file.id);
        if (source) edges.push({ source, target: point });
      }
  let shown = points;
  let connections = edges;
  if (focus) {
    const local = new Set([focus]);
    for (let depth = 0; depth < 2; depth++) {
      const next = new Set(local);
      for (const e of edges) {
        if (local.has(e.source.id)) next.add(e.target.id);
        if (local.has(e.target.id)) next.add(e.source.id);
      }
      for (const id of next) local.add(id);
    }
    shown = shown.filter((p) => local.has(p.id));
    connections = edges.filter((e) => local.has(e.source.id) && local.has(e.target.id));
  }
  for (const e of connections) {
    e.source.degree++;
    e.target.degree++;
  }
  if (!style.orphans) shown = shown.filter((p) => p.degree > 0);
  shown.sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id));
  const neighbours = new Map(shown.map((p) => [p.id, new Set<string>()]));
  for (const e of connections) {
    neighbours.get(e.source.id)?.add(e.target.id);
    neighbours.get(e.target.id)?.add(e.source.id);
  }
  const visited = new Set<string>();
  const components: GraphPoint[][] = [];
  const pointsById = new Map(shown.map((p) => [p.id, p]));
  for (const point of shown) {
    if (visited.has(point.id)) continue;
    const component: GraphPoint[] = [];
    const queue = [point.id];
    visited.add(point.id);
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index] ?? '';
      const p = pointsById.get(id);
      if (p) component.push(p);
      for (const neighbour of neighbours.get(id) ?? [])
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
    }
    components.push(component);
  }
  const extentOf = (component: GraphPoint[]) =>
    component.length === 1
      ? style.spacing * 0.25
      : Math.max(style.spacing, Math.sqrt(component.length) * style.spacing * 0.45);
  const rowWidth =
    Math.sqrt(components.reduce((area, c) => area + (extentOf(c) * 2 + style.spacing) ** 2, 0)) *
    1.3;
  let offsetX = 0,
    offsetY = 0,
    rowHeight = 0;
  for (const component of components.sort((a, b) => b.length - a.length)) {
    const extent = extentOf(component);
    if (offsetX > 0 && offsetX + extent * 2 > rowWidth) {
      offsetX = 0;
      offsetY += rowHeight + style.spacing;
      rowHeight = 0;
    }
    component.forEach((p, i) => {
      const angle = i * 2.399963;
      const radius = Math.sqrt(i) * style.spacing * 0.4;
      p.x = offsetX + extent + Math.cos(angle) * radius;
      p.y = offsetY + extent + Math.sin(angle) * radius;
    });
    offsetX += extent * 2 + style.spacing;
    rowHeight = Math.max(rowHeight, extent * 2);
  }
  return { nodes: shown, edges: connections };
}

/** Local spatial buckets keep repulsion practical on a tablet. */
export function step(model: GraphModel, spacing: number): void {
  const cell = spacing;
  const buckets = new Map<string, GraphPoint[]>();
  for (const n of model.nodes) {
    const key = `${String(Math.floor(n.x / cell))},${String(Math.floor(n.y / cell))}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(n);
    buckets.set(key, bucket);
  }
  for (const n of model.nodes) {
    const x = Math.floor(n.x / cell),
      y = Math.floor(n.y / cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        for (const other of buckets.get(`${String(x + dx)},${String(y + dy)}`) ?? []) {
          if (n === other) continue;
          const a = n.x - other.x,
            b = n.y - other.y,
            d = Math.max(25, a * a + b * b);
          const force = Math.min(2, ((spacing * spacing) / d) * 0.035);
          n.vx += a * force;
          n.vy += b * force;
        }
      }
    n.vx -= n.x * 0.00015;
    n.vy -= n.y * 0.00015;
  }
  for (const e of model.edges) {
    const dx = e.target.x - e.source.x,
      dy = e.target.y - e.source.y;
    const distance = Math.hypot(dx, dy) || 1;
    const pull = ((distance - spacing) * 0.006) / distance;
    e.source.vx += dx * pull;
    e.source.vy += dy * pull;
    e.target.vx -= dx * pull;
    e.target.vy -= dy * pull;
  }
  for (const n of model.nodes) {
    n.vx = Math.max(-8, Math.min(8, n.vx * 0.75));
    n.vy = Math.max(-8, Math.min(8, n.vy * 0.75));
    n.x += n.vx;
    n.y += n.vy;
  }
}
