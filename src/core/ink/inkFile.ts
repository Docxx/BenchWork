/**
 * Handwriting and drawings, saved as `.ink.json` files beside the pages
 * that embed them with `![[...]]`. Strokes are vectors: points with
 * position, pressure and time, so ink stays sharp at any size and text
 * recognised later can be saved beside it.
 *
 * Each stroke has its own id, so two copies of a drawing edited on
 * different devices merge by keeping every stroke from both. Files are
 * written one stroke per line, so they compare well line by line too.
 */

export type InkTool = 'pen' | 'highlighter';
export const INK_TOOLS: readonly InkTool[] = ['pen', 'highlighter'];

/** `[x, y, pressure, t]`: CSS pixels from the drawing's top left, 0 to 1, ms since the stroke began. */
export type InkPoint = [number, number, number, number];

export interface InkStroke {
  id: string;
  tool: InkTool;
  /** A colour such as `#1d2725`. */
  colour: string;
  /** Base width in CSS pixels, before pressure. */
  width: number;
  points: InkPoint[];
}

export interface Ink {
  version: 1;
  /** The drawing area in CSS pixels; strokes may reach past it and it then grows. */
  width: number;
  height: number;
  strokes: InkStroke[];
  /** Text recognised from the handwriting, for search; null until recognised. */
  recognisedText: string | null;
}

export const INK_EXTENSION = '.ink.json';

export function emptyInk(width: number, height: number): Ink {
  return { version: 1, width, height, strokes: [], recognisedText: null };
}

/** A short random id for a new stroke. */
export function newStrokeId(): string {
  return Math.random().toString(36).slice(2, 10).padEnd(8, '0');
}

const COLOUR = /^#[0-9a-f]{6}$/i;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function readPoint(value: unknown): InkPoint | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [x, y, pressure = 0.5, t = 0] = value as unknown[];
  if (!finite(x) || !finite(y) || !finite(pressure) || !finite(t)) return null;
  return [x, y, Math.min(1, Math.max(0, pressure)), Math.max(0, t)];
}

function readStroke(value: unknown, seen: Set<string>): InkStroke | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const points = Array.isArray(v['points'])
    ? v['points'].map(readPoint).filter((p): p is InkPoint => p !== null)
    : [];
  if (points.length === 0) return null;
  let id = typeof v['id'] === 'string' && v['id'] !== '' ? v['id'] : newStrokeId();
  // Two strokes with one id would merge as one; the second gets a new id.
  while (seen.has(id)) id = newStrokeId();
  seen.add(id);
  const tool = v['tool'];
  const colour = v['colour'];
  const width = v['width'];
  return {
    id,
    tool:
      typeof tool === 'string' && (INK_TOOLS as readonly string[]).includes(tool)
        ? (tool as InkTool)
        : 'pen',
    colour: typeof colour === 'string' && COLOUR.test(colour) ? colour.toLowerCase() : '#000000',
    width: finite(width) && width > 0 ? width : 2,
    points,
  };
}

export interface ParsedInk {
  ink: Ink;
  /** Why the file could not be read; it is then never written over. */
  error: string | null;
}

/** Reads an `.ink.json` file. Never throws; strokes it cannot read are left out. */
export function parseInk(text: string): ParsedInk {
  let data: unknown;
  try {
    data = text.trim() === '' ? {} : JSON.parse(text);
  } catch {
    return { ink: emptyInk(0, 0), error: 'The ink file is not valid JSON' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ink: emptyInk(0, 0), error: 'The ink file is not a drawing' };
  }
  const d = data as Record<string, unknown>;
  if (d['version'] !== undefined && d['version'] !== 1) {
    return { ink: emptyInk(0, 0), error: 'The ink file was made by a newer BenchWork' };
  }
  const seen = new Set<string>();
  const strokes = Array.isArray(d['strokes'])
    ? d['strokes'].map((s) => readStroke(s, seen)).filter((s): s is InkStroke => s !== null)
    : [];
  const width = d['width'];
  const height = d['height'];
  const recognised = d['recognisedText'];
  return {
    ink: {
      version: 1,
      width: finite(width) && width > 0 ? width : 0,
      height: finite(height) && height > 0 ? height : 0,
      strokes,
      recognisedText: typeof recognised === 'string' ? recognised : null,
    },
    error: null,
  };
}

const round = (n: number, places: number) => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/** Writes an `.ink.json` file: compact points, one stroke per line. */
export function serialiseInk(ink: Ink): string {
  const strokes = ink.strokes.map((s) =>
    JSON.stringify({
      id: s.id,
      tool: s.tool,
      colour: s.colour,
      width: round(s.width, 2),
      points: s.points.map(([x, y, p, t]) => [
        round(x, 2),
        round(y, 2),
        round(p, 3),
        Math.round(t),
      ]),
    }),
  );
  return [
    '{',
    '  "version": 1,',
    `  "width": ${String(Math.round(ink.width))},`,
    `  "height": ${String(Math.round(ink.height))},`,
    `  "recognisedText": ${JSON.stringify(ink.recognisedText)},`,
    strokes.length === 0
      ? '  "strokes": []'
      : `  "strokes": [\n    ${strokes.join(',\n    ')}\n  ]`,
    '}',
    '',
  ].join('\n');
}

/**
 * Two copies of one drawing as one: every stroke from both, in `mine`'s
 * order with strokes only in `theirs` after. A stroke erased in one copy
 * comes back, which loses nothing.
 */
export function mergeInk(mine: Ink, theirs: Ink): Ink {
  const ids = new Set(mine.strokes.map((s) => s.id));
  return {
    version: 1,
    width: Math.max(mine.width, theirs.width),
    height: Math.max(mine.height, theirs.height),
    strokes: [...mine.strokes, ...theirs.strokes.filter((s) => !ids.has(s.id))],
    recognisedText: mine.recognisedText ?? theirs.recognisedText,
  };
}

/** A rectangle in CSS pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The area strokes cover, with room for their widest line; null for none. */
export function inkBounds(strokes: readonly InkStroke[]): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    const pad = s.width * 1.5 + 2;
    for (const [x, y] of s.points) {
      minX = Math.min(minX, x - pad);
      minY = Math.min(minY, y - pad);
      maxX = Math.max(maxX, x + pad);
      maxY = Math.max(maxY, y + pad);
    }
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
