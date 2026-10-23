/**
 * A canvas is a `.canvas.json` file: items placed on a free surface, and
 * arrows between them.
 *
 *   { "version": 1,
 *     "items": [{ "id", "kind", "x", "y", "width", "height", ... }],
 *     "links": [{ "id", "from", "to", "label"? }] }
 *
 * Kinds: `text` (with `text`), `page`, `image` and `file` (with a vault
 * `path`). Items of other kinds, such as ink strokes from a later module,
 * and any extra keys are kept exactly as they are when the canvas is saved.
 */

export const CANVAS_ENDING = '.canvas.json';
export const KNOWN_KINDS = ['text', 'page', 'image', 'file'] as const;
export type KnownKind = (typeof KNOWN_KINDS)[number];

export interface CanvasItem {
  id: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  path?: string;
  [key: string]: unknown;
}

export interface CanvasLink {
  id: string;
  from: string;
  to: string;
  label?: string;
  [key: string]: unknown;
}

export interface CanvasDoc {
  version: number;
  items: CanvasItem[];
  links: CanvasLink[];
  [key: string]: unknown;
}

export const DEFAULT_SIZE: Record<KnownKind, { width: number; height: number }> = {
  text: { width: 220, height: 120 },
  page: { width: 260, height: 160 },
  image: { width: 320, height: 240 },
  file: { width: 240, height: 80 },
};

export function emptyCanvas(): CanvasDoc {
  return { version: 1, items: [], links: [] };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const number = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** Reads a canvas file. Throws with a plain message if it is not one. */
export function parseCanvas(text: string): CanvasDoc {
  let data: unknown;
  try {
    data = text.trim() === '' ? {} : JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  if (!isRecord(data)) throw new Error('The file is not a canvas.');
  const items: CanvasItem[] = [];
  const ids = new Set<string>();
  for (const raw of Array.isArray(data['items']) ? data['items'] : []) {
    if (!isRecord(raw)) continue;
    let id = typeof raw['id'] === 'string' && raw['id'] !== '' ? raw['id'] : newId();
    if (ids.has(id)) id = newId();
    ids.add(id);
    items.push({
      ...raw,
      id,
      kind: typeof raw['kind'] === 'string' ? raw['kind'] : 'unknown',
      x: number(raw['x'], 0),
      y: number(raw['y'], 0),
      width: Math.max(40, number(raw['width'], 200)),
      height: Math.max(30, number(raw['height'], 100)),
    });
  }
  const links: CanvasLink[] = [];
  for (const raw of Array.isArray(data['links']) ? data['links'] : []) {
    if (!isRecord(raw) || typeof raw['from'] !== 'string' || typeof raw['to'] !== 'string')
      continue;
    links.push({
      ...raw,
      id: typeof raw['id'] === 'string' && raw['id'] !== '' ? raw['id'] : newId(),
      from: raw['from'],
      to: raw['to'],
    });
  }
  return { ...data, version: number(data['version'], 1), items, links };
}

/** The file's text: tidy JSON, so changes show clearly in version control. */
export function serialiseCanvas(doc: CanvasDoc): string {
  const ids = new Set(doc.items.map((i) => i.id));
  // Arrows to items that are gone are dropped.
  const links = doc.links.filter((l) => ids.has(l.from) && ids.has(l.to));
  return `${JSON.stringify({ ...doc, links }, null, 2)}\n`;
}

export function newId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** Whether a path is a canvas. */
export function isCanvas(path: string): boolean {
  return path.toLowerCase().endsWith(CANVAS_ENDING);
}

/** What kind of card a vault file makes. */
export function kindForPath(path: string): KnownKind {
  const lower = path.toLowerCase();
  if (lower.endsWith('.md')) return 'page';
  if (/\.(png|jpe?g|gif|webp|svg|bmp)$/.test(lower)) return 'image';
  return 'file';
}
