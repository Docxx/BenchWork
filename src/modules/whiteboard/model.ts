/**
 * A whiteboard: an endless board of pen strokes, shapes, text, sticky
 * notes and images, saved as `<name>.board.json` beside notes. Everything
 * is in board coordinates; the view pans and zooms over them. The order of
 * the items is their stacking: later ones are in front.
 */

export const BOARD_ENDING = '.board.json';

/** A point with the pen's pressure, from 0 to 1. */
export type BoardPoint = [x: number, y: number, pressure: number];

export const PEN_KINDS = ['pen', 'pencil', 'marker', 'highlighter'] as const;
export type PenKind = (typeof PEN_KINDS)[number];

export const SHAPE_KINDS = ['rect', 'ellipse', 'line', 'arrow'] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export interface StrokeItem {
  id: string;
  kind: 'stroke';
  pen: PenKind;
  colour: string;
  width: number;
  points: BoardPoint[];
}

export interface ShapeItem {
  id: string;
  kind: 'shape';
  shape: ShapeKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  colour: string;
  width: number;
  /** A fill colour for boxes and ellipses, or null for none. */
  fill: string | null;
  /** For lines and arrows: the items its ends are joined to, if any. */
  from?: string;
  to?: string;
}

export interface TextItem {
  id: string;
  kind: 'text';
  x: number;
  y: number;
  /** Width the text wraps at. */
  w: number;
  text: string;
  colour: string;
  /** Text size, in board units. */
  size: number;
}

export interface NoteItem {
  id: string;
  kind: 'note';
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  /** The note's paper colour. */
  colour: string;
}

export interface ImageItem {
  id: string;
  kind: 'image';
  x: number;
  y: number;
  w: number;
  h: number;
  /** The image file, as a vault path. */
  path: string;
}

export type BoardItem = StrokeItem | ShapeItem | TextItem | NoteItem | ImageItem;

export interface Board {
  version: 1;
  items: BoardItem[];
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function emptyBoard(): Board {
  return { version: 1, items: [] };
}

export function newId(): string {
  return crypto.randomUUID().slice(0, 12);
}

const COLOUR = /^#[0-9a-f]{6}$/i;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const colourOf = (v: unknown, fallback: string) =>
  typeof v === 'string' && COLOUR.test(v) ? v : fallback;

function parseItem(raw: unknown): BoardItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r['id'] === 'string' && r['id'] !== '' ? r['id'] : newId();
  switch (r['kind']) {
    case 'stroke': {
      if (!Array.isArray(r['points'])) return null;
      const points = (r['points'] as unknown[])
        .filter((p): p is number[] => Array.isArray(p) && num(p[0]) && num(p[1]))
        .map((p): BoardPoint => [p[0] ?? 0, p[1] ?? 0, num(p[2]) ? p[2] : 0.5]);
      if (points.length === 0) return null;
      return {
        id,
        kind: 'stroke',
        pen: PEN_KINDS.find((k) => k === r['pen']) ?? 'pen',
        colour: colourOf(r['colour'], '#1d2725'),
        width: num(r['width']) ? Math.min(60, Math.max(0.5, r['width'])) : 2.5,
        points,
      };
    }
    case 'shape': {
      if (!num(r['x1']) || !num(r['y1']) || !num(r['x2']) || !num(r['y2'])) return null;
      const item: ShapeItem = {
        id,
        kind: 'shape',
        shape: SHAPE_KINDS.find((k) => k === r['shape']) ?? 'rect',
        x1: r['x1'],
        y1: r['y1'],
        x2: r['x2'],
        y2: r['y2'],
        colour: colourOf(r['colour'], '#1d2725'),
        width: num(r['width']) ? Math.min(40, Math.max(0.5, r['width'])) : 2,
        fill: typeof r['fill'] === 'string' && COLOUR.test(r['fill']) ? r['fill'] : null,
      };
      if (typeof r['from'] === 'string') item.from = r['from'];
      if (typeof r['to'] === 'string') item.to = r['to'];
      return item;
    }
    case 'text':
      if (!num(r['x']) || !num(r['y'])) return null;
      return {
        id,
        kind: 'text',
        x: r['x'],
        y: r['y'],
        w: num(r['w']) ? Math.max(40, r['w']) : 240,
        text: typeof r['text'] === 'string' ? r['text'] : '',
        colour: colourOf(r['colour'], '#1d2725'),
        size: num(r['size']) ? Math.min(200, Math.max(6, r['size'])) : 18,
      };
    case 'note':
      if (!num(r['x']) || !num(r['y'])) return null;
      return {
        id,
        kind: 'note',
        x: r['x'],
        y: r['y'],
        w: num(r['w']) ? Math.max(60, r['w']) : 180,
        h: num(r['h']) ? Math.max(60, r['h']) : 140,
        text: typeof r['text'] === 'string' ? r['text'] : '',
        colour: colourOf(r['colour'], '#ffe58a'),
      };
    case 'image':
      if (!num(r['x']) || !num(r['y']) || typeof r['path'] !== 'string') return null;
      return {
        id,
        kind: 'image',
        x: r['x'],
        y: r['y'],
        w: num(r['w']) ? Math.max(10, r['w']) : 200,
        h: num(r['h']) ? Math.max(10, r['h']) : 150,
        path: r['path'],
      };
    default:
      return null;
  }
}

/** Reads a board's text. Null if it is not a board at all; odd items are left out. */
export function parseBoard(text: string): Board | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const items = (raw as Record<string, unknown>)['items'];
  if (!Array.isArray(items)) return null;
  return {
    version: 1,
    items: (items as unknown[]).map(parseItem).filter((i): i is BoardItem => i !== null),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** A board as text, with numbers kept short so the file stays small. */
export function serialiseBoard(board: Board): string {
  return `${JSON.stringify(
    board,
    (_key, value: unknown) => (typeof value === 'number' ? round(value) : value),
    1,
  )}\n`;
}

/** The space an item takes up. Text grows downwards with its lines. */
export function boundsOf(item: BoardItem): Box {
  switch (item.kind) {
    case 'stroke': {
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const [x, y] of item.points) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      const pad = item.width / 2;
      return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
    }
    case 'shape':
      return {
        x: Math.min(item.x1, item.x2),
        y: Math.min(item.y1, item.y2),
        w: Math.abs(item.x2 - item.x1),
        h: Math.abs(item.y2 - item.y1),
      };
    case 'text': {
      const lines = wrapText(item.text, item.w, item.size).length;
      return { x: item.x, y: item.y, w: item.w, h: Math.max(1, lines) * item.size * 1.3 };
    }
    case 'note':
    case 'image':
      return { x: item.x, y: item.y, w: item.w, h: item.h };
  }
}

/** The box round several items; null for none. */
export function boundsOfAll(items: readonly BoardItem[]): Box | null {
  if (items.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const item of items) {
    const b = boundsOf(item);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Text broken into lines that fit a width, by a rough measure of letters:
 * about 0.55 of the text size each, which is close enough to lay text out
 * the same on every device without measuring fonts.
 */
export function wrapText(text: string, width: number, size: number): string[] {
  const perLine = Math.max(4, Math.floor(width / (size * 0.55)));
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line === '' ? word : `${line} ${word}`;
      if (next.length <= perLine) {
        line = next;
        continue;
      }
      if (line !== '') lines.push(line);
      // A word longer than a line is cut to fit.
      let rest = word;
      while (rest.length > perLine) {
        lines.push(rest.slice(0, perLine));
        rest = rest.slice(perLine);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax,
    dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Whether a point touches an item, within `slop` board units. */
export function hits(item: BoardItem, x: number, y: number, slop: number): boolean {
  const b = boundsOf(item);
  if (x < b.x - slop || y < b.y - slop || x > b.x + b.w + slop || y > b.y + b.h + slop) {
    return false;
  }
  if (item.kind === 'stroke') {
    const reach = item.width / 2 + slop;
    const pts = item.points;
    if (pts.length === 1)
      return Math.hypot(x - (pts[0]?.[0] ?? 0), y - (pts[0]?.[1] ?? 0)) <= reach;
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1],
        c = pts[i];
      if (a && c && distanceToSegment(x, y, a[0], a[1], c[0], c[1]) <= reach) return true;
    }
    return false;
  }
  if (item.kind === 'shape') {
    const reach = item.width / 2 + slop;
    if (item.shape === 'line' || item.shape === 'arrow') {
      return distanceToSegment(x, y, item.x1, item.y1, item.x2, item.y2) <= reach;
    }
    if (item.fill !== null) return true;
    // An empty box or ellipse is touched on its outline.
    if (item.shape === 'rect') {
      return (
        x - b.x <= reach || b.x + b.w - x <= reach || y - b.y <= reach || b.y + b.h - y <= reach
      );
    }
    const rx = b.w / 2 || 1,
      ry = b.h / 2 || 1;
    const d = Math.hypot((x - (b.x + rx)) / rx, (y - (b.y + ry)) / ry);
    return Math.abs(d - 1) * Math.min(rx, ry) <= reach;
  }
  return true;
}

/** The front-most item at a point, or null. */
export function itemAt(items: readonly BoardItem[], x: number, y: number, slop: number) {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item && hits(item, x, y, slop)) return item;
  }
  return null;
}

/** Whether a point is inside a closed loop of points. */
export function insideLoop(loop: readonly (readonly [number, number])[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
    const a = loop[i],
      b = loop[j];
    if (!a || !b) continue;
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

/** The items a lasso loop takes in: those whose middle is inside it. */
export function lassoed(items: readonly BoardItem[], loop: readonly (readonly [number, number])[]) {
  return items
    .filter((item) => {
      const b = boundsOf(item);
      return insideLoop(loop, b.x + b.w / 2, b.y + b.h / 2);
    })
    .map((i) => i.id);
}

/** An item moved by an amount. */
export function moved(item: BoardItem, dx: number, dy: number): BoardItem {
  switch (item.kind) {
    case 'stroke':
      return { ...item, points: item.points.map(([x, y, p]): BoardPoint => [x + dx, y + dy, p]) };
    case 'shape':
      return { ...item, x1: item.x1 + dx, y1: item.y1 + dy, x2: item.x2 + dx, y2: item.y2 + dy };
    default:
      return { ...item, x: item.x + dx, y: item.y + dy };
  }
}

/** An item stretched from the box `from` to the box `to`, as when a selection is resized. */
export function resized(item: BoardItem, from: Box, to: Box): BoardItem {
  const sx = from.w === 0 ? 1 : to.w / from.w;
  const sy = from.h === 0 ? 1 : to.h / from.h;
  const fx = (x: number) => to.x + (x - from.x) * sx;
  const fy = (y: number) => to.y + (y - from.y) * sy;
  const scale = Math.sqrt(Math.abs(sx * sy)) || 1;
  switch (item.kind) {
    case 'stroke':
      return {
        ...item,
        width: Math.min(60, Math.max(0.5, item.width * scale)),
        points: item.points.map(([x, y, p]): BoardPoint => [fx(x), fy(y), p]),
      };
    case 'shape':
      return { ...item, x1: fx(item.x1), y1: fy(item.y1), x2: fx(item.x2), y2: fy(item.y2) };
    case 'text':
      return {
        ...item,
        x: fx(item.x),
        y: fy(item.y),
        w: Math.max(40, item.w * Math.abs(sx)),
        size: Math.min(200, Math.max(6, item.size * Math.abs(sy))),
      };
    default:
      return {
        ...item,
        x: fx(item.x),
        y: fy(item.y),
        w: Math.max(10, item.w * Math.abs(sx)),
        h: Math.max(10, item.h * Math.abs(sy)),
      };
  }
}

/** A copy of items with new ids, joined arrows kept joined to the copies. */
export function duplicated(items: readonly BoardItem[], dx: number, dy: number): BoardItem[] {
  const ids = new Map(items.map((i) => [i.id, newId()]));
  return items.map((item) => {
    const copy = { ...moved(item, dx, dy), id: ids.get(item.id) ?? newId() };
    if (copy.kind === 'shape') {
      if (copy.from !== undefined) copy.from = ids.get(copy.from) ?? copy.from;
      if (copy.to !== undefined) copy.to = ids.get(copy.to) ?? copy.to;
    }
    return copy;
  });
}

/** Where a line from a box's middle towards a point leaves the box. */
function edgeTowards(b: Box, x: number, y: number): [number, number] {
  const cx = b.x + b.w / 2,
    cy = b.y + b.h / 2;
  const dx = x - cx,
    dy = y - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const t = Math.min(
    dx === 0 ? Infinity : b.w / 2 / Math.abs(dx),
    dy === 0 ? Infinity : b.h / 2 / Math.abs(dy),
  );
  return [cx + dx * t, cy + dy * t];
}

/**
 * Lines and arrows joined to items follow them: each joined end sits on
 * the edge of its item, facing the other end. An end whose item has gone
 * stays where it was.
 */
export function withJoinsFollowed(items: readonly BoardItem[]): BoardItem[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return items.map((item) => {
    if (item.kind !== 'shape' || (item.from === undefined && item.to === undefined)) return item;
    const from = item.from === undefined ? undefined : byId.get(item.from);
    const to = item.to === undefined ? undefined : byId.get(item.to);
    const fb = from ? boundsOf(from) : null;
    const tb = to ? boundsOf(to) : null;
    const next = { ...item };
    if (from === undefined) delete next.from;
    if (to === undefined) delete next.to;
    const towardsFrom: [number, number] = tb
      ? [tb.x + tb.w / 2, tb.y + tb.h / 2]
      : [item.x2, item.y2];
    const towardsTo: [number, number] = fb
      ? [fb.x + fb.w / 2, fb.y + fb.h / 2]
      : [item.x1, item.y1];
    if (fb) [next.x1, next.y1] = edgeTowards(fb, towardsFrom[0], towardsFrom[1]);
    if (tb) [next.x2, next.y2] = edgeTowards(tb, towardsTo[0], towardsTo[1]);
    return next;
  });
}

/**
 * A roughly drawn shape tidied: a stroke that ends near where it began is
 * a box or an ellipse, whichever it is more like, and an open one that
 * keeps close to straight is a line. Null if it is neither.
 */
export function tidied(stroke: StrokeItem): ShapeItem | null {
  const pts = stroke.points;
  if (pts.length < 4) return null;
  const first = pts[0],
    last = pts.at(-1);
  if (!first || !last) return null;
  const b = boundsOf({ ...stroke, width: 0 });
  const size = Math.max(b.w, b.h);
  if (size < 12) return null;
  const base = {
    id: stroke.id,
    kind: 'shape' as const,
    colour: stroke.colour,
    width: stroke.width,
    fill: null,
  };
  const gap = Math.hypot(last[0] - first[0], last[1] - first[1]);
  if (gap < size * 0.25) {
    // Closed: how far its points are from an ellipse, against from a box's edges.
    const cx = b.x + b.w / 2,
      cy = b.y + b.h / 2;
    const rx = b.w / 2 || 1,
      ry = b.h / 2 || 1;
    let ellipse = 0,
      rect = 0;
    for (const [x, y] of pts) {
      ellipse += Math.abs(Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
      rect += Math.min(x - b.x, b.x + b.w - x, y - b.y, b.y + b.h - y);
    }
    return {
      ...base,
      shape: ellipse < rect ? 'ellipse' : 'rect',
      x1: b.x,
      y1: b.y,
      x2: b.x + b.w,
      y2: b.y + b.h,
    };
  }
  let off = 0;
  for (const [x, y] of pts) {
    off = Math.max(off, distanceToSegment(x, y, first[0], first[1], last[0], last[1]));
  }
  if (off > gap * 0.12) return null;
  return { ...base, shape: 'line', x1: first[0], y1: first[1], x2: last[0], y2: last[1] };
}
