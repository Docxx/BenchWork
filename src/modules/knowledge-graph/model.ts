import type { VaultGraph } from '@core/api';

export interface GraphStyle {
  palette: 'aurora' | 'ember' | 'violet' | 'theme';
  colourBy: 'notebook' | 'kind' | 'tag';
  labels: boolean;
  tags: boolean;
  orphans: boolean;
  glow: boolean;
  /**
   * Signals flowing along the links, while the pointer is on the graph. Off
   * unless chosen; it replaced `motion`, which was on for everyone.
   */
  signals: boolean;
  /** The layout settles new notes, and answers a drag. */
  live: boolean;
  /** A note's neighbours light up smoothly, and the rest dim. */
  focus: boolean;
  /** The graph grows in when opened, and the view glides to a chosen note. */
  entrance: boolean;
  /** How fast it all moves: 1 is usual. */
  speed: number;
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
  signals: false,
  live: true,
  focus: true,
  entrance: true,
  speed: 1,
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
  for (const key of [
    'labels',
    'tags',
    'orphans',
    'glow',
    'signals',
    'live',
    'focus',
    'entrance',
  ] as const)
    if (typeof data[key] === 'boolean') style[key] = data[key];
  for (const [key, min, max] of [
    ['size', 2, 12],
    ['spacing', 40, 240],
    ['opacity', 0.05, 1],
    ['speed', 0.25, 3],
  ] as const) {
    const n = data[key];
    if (typeof n === 'number' && Number.isFinite(n)) style[key] = Math.max(min, Math.min(max, n));
  }
  return style;
}
/** What the graph shows of the vault, beside how it looks. */
export interface GraphFilters {
  folder: string;
  /** `all`, `note` or `document`. */
  kind: string;
  tag: string;
}

export const DEFAULT_FILTERS: GraphFilters = { folder: '', kind: 'all', tag: '' };

/** A look kept under a name, to go back to. */
export interface GraphPreset {
  name: string;
  style: GraphStyle;
}

/** Everything the graph remembers, kept with the vault. */
export interface GraphView {
  style: GraphStyle;
  filters: GraphFilters;
  presets: GraphPreset[];
  /** The appearance panel was open. */
  panel: boolean;
  /** The search and filter bar was showing; it is hidden until asked for. */
  options: boolean;
}

/**
 * Reads the saved view. A file from before filters and presets were kept
 * is a style on its own, and reads as one.
 */
export function parseView(value: unknown): GraphView {
  const data = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const view: GraphView = {
    style: parseStyle('style' in data ? data['style'] : value),
    filters: { ...DEFAULT_FILTERS },
    presets: [],
    panel: data['panel'] === true,
    options: data['options'] === true,
  };
  const filters = data['filters'];
  if (filters && typeof filters === 'object') {
    const f = filters as Record<string, unknown>;
    if (typeof f['folder'] === 'string') view.filters.folder = f['folder'];
    if (f['kind'] === 'note' || f['kind'] === 'document') view.filters.kind = f['kind'];
    if (typeof f['tag'] === 'string') view.filters.tag = f['tag'];
  }
  if (Array.isArray(data['presets'])) {
    for (const p of data['presets'] as unknown[]) {
      if (!p || typeof p !== 'object') continue;
      const { name, style } = p as Record<string, unknown>;
      if (typeof name !== 'string' || name.trim() === '') continue;
      view.presets.push({ name: name.trim().slice(0, 40), style: parseStyle(style) });
    }
    view.presets = view.presets.slice(0, 20);
  }
  return view;
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

/**
 * What the graph is drawn from, as one string: the same string means the
 * same graph, so a saved page that changed no links or tags redraws nothing.
 */
export function graphSignature(data: VaultGraph): string {
  const nodes = data.nodes
    .map((n) => [n.id, n.path, n.title, n.kind, n.tags.join(',')].join('\t'))
    .sort();
  const edges = data.edges.map((e) => `${e.source}\t${e.target}`).sort();
  return [nodes.join('\n'), edges.join('\n'), data.warnings.join('\n')].join('\n--\n');
}

/**
 * Puts nodes back where they were, and settles only the new ones around
 * them, so a graph that gains a note does not rearrange itself. Returns
 * how many nodes were already placed.
 */
export function keepPlaces(
  model: GraphModel,
  places: ReadonlyMap<string, { x: number; y: number }>,
  spacing: number,
  rounds = 120,
): number {
  const known: GraphPoint[] = [];
  for (const n of model.nodes) {
    const place = places.get(n.id);
    if (!place) continue;
    n.x = place.x;
    n.y = place.y;
    known.push(n);
  }
  if (known.length === 0 || known.length === model.nodes.length) return known.length;
  // New nodes start beside a placed neighbour, or near the middle.
  const placed = new Set(known.map((n) => n.id));
  for (const e of model.edges) {
    for (const [a, b] of [
      [e.source, e.target],
      [e.target, e.source],
    ] as const) {
      if (!placed.has(a.id) && placed.has(b.id)) {
        a.x = b.x + spacing * 0.5 * Math.cos(a.id.length);
        a.y = b.y + spacing * 0.5 * Math.sin(a.id.length);
        placed.add(a.id);
      }
    }
  }
  for (let i = 0; i < rounds; i++) {
    step(model, spacing);
    for (const n of known) {
      const place = places.get(n.id);
      if (!place) continue;
      n.x = place.x;
      n.y = place.y;
      n.vx = 0;
      n.vy = 0;
    }
  }
  return known.length;
}
