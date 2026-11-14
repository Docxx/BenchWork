import {
  blotLayout,
  blotTop,
  parseBlot,
  parseTable,
  type Blot,
  type BlotLayout,
  type Table,
} from './blot';
import {
  labelRoom,
  layout,
  letter as letterFor,
  newGrid,
  newId,
  parseGrid,
  POINT,
  type Box,
  type Grid,
  type Layout,
  type LetterStyle,
} from './model';
import { parseShape, type Shape } from './shapes';

/**
 * A figure: blocks placed freely on a page of real size, saved as
 * `<name>.figure.json`. A block is a grid of images (one image is a grid of
 * one), a text box, and later a graph. Blocks get letters, A, B, C, in
 * reading order, unless one is given its own or none. Sizes are in mm.
 */

export const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

export interface TextBox {
  /** Plain text with a little markup: `*italic*`, `**bold**`, `^up^`, `~down~`. */
  text: string;
  /** Points. */
  size: number;
  align: TextAlign;
  colour: string;
  /** Turned to read upwards, as a label down the side. */
  upright: boolean;
}

interface BlockBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Null for the next letter in reading order, '' for none, or its own, such as A′. */
  letter: string | null;
}

export type Block = BlockBase &
  (
    | { kind: 'grid'; grid: Grid; blot: Blot | null }
    | { kind: 'text'; text: TextBox }
    | { kind: 'table'; table: Table }
    | { kind: 'shape'; shape: Shape }
  );
export type GridBlock = Extract<Block, { kind: 'grid' }>;
export type TextBlock = Extract<Block, { kind: 'text' }>;
export type TableBlock = Extract<Block, { kind: 'table' }>;

/** Only images (and later graphs) take the next letter unless told otherwise. */
export const takesLetter = (b: Block) => b.kind === 'grid';

export interface FigureLetters {
  form: LetterStyle['form'];
  /** Points. */
  size: number;
  show: boolean;
}

export interface FigureDoc {
  version: 2;
  /** Page width, mm. The height follows from what is on it. */
  width: number;
  /** The space blocks snap to between them, mm. */
  gap: number;
  letters: FigureLetters;
  blocks: Block[];
}

/** Text sizes and letters start as most journals ask. */
export const START_LETTERS: FigureLetters = { form: 'upper', size: 10, show: true };

export function newDoc(width = 174): FigureDoc {
  return { version: 2, width, gap: 3, letters: { ...START_LETTERS }, blocks: [] };
}

/** A grid of images for a new block: no letters in its panels, as the block has one. */
export function blockGrid(rows: number, cols: number, width: number): Grid {
  const grid = newGrid(rows, cols, width);
  return { ...grid, gap: 1, letters: { ...grid.letters, show: false } };
}

export function newText(text = 'Text'): TextBox {
  return { text, size: 8, align: 'left', colour: '#000000', upright: false };
}

// ---- Where things go ----

/** Blocks in reading order: by rows down the page, then across each row. */
export function readingOrder(blocks: readonly Block[]): Block[] {
  const byTop = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Block[][] = [];
  let row: Block[] = [];
  let rowEnd = -Infinity;
  for (const b of byTop) {
    // A block starting above the middle of the row's first one is in that row.
    if (row.length > 0 && b.y < rowEnd) row.push(b);
    else {
      if (row.length > 0) rows.push(row);
      row = [b];
      rowEnd = b.y + b.h / 2;
    }
  }
  if (row.length > 0) rows.push(row);
  return rows.flatMap((r) => r.sort((a, b) => a.x - b.x));
}

/** Each block's letter as shown: '' for none. */
export function letters(doc: FigureDoc): Map<string, string> {
  const out = new Map<string, string>();
  let n = 0;
  for (const b of readingOrder(doc.blocks)) {
    if (!doc.letters.show || b.letter === '') out.set(b.id, '');
    else if (b.letter === null) {
      out.set(b.id, takesLetter(b) ? letterFor(n, doc.letters.form) : '');
      if (takesLetter(b)) n += 1;
    } else out.set(b.id, b.letter);
  }
  return out;
}

export interface BlockLayout {
  block: Block;
  box: Box;
  /** Where the block's content goes, under its letter when that needs room. */
  content: Box;
  /** The letter as shown, and where its middle-left sits. */
  letter: { text: string; x: number; y: number } | null;
  /** For a grid, where its panels and labels are. */
  grid: Layout | null;
  /** For a blot, where its labels go round the image. */
  blot: BlotLayout | null;
}

export interface DocLayout {
  width: number;
  /** The page's height: down to the lowest block, or a little if empty. */
  height: number;
  blocks: BlockLayout[];
}

/** The room a letter takes above a block's content, mm. */
export const letterStrip = (doc: FigureDoc) => doc.letters.size * POINT * 1.2;

/**
 * Where a block's content goes. A grid with labels on its left and top
 * keeps the letter in that corner; anything else has a strip above it.
 */
export function contentBox(doc: FigureDoc, block: Block, text: string): Box {
  const box = { x: block.x, y: block.y, w: block.w, h: block.h };
  if (text === '') return box;
  if (block.kind === 'grid' && !block.blot) {
    const room = labelRoom(block.grid);
    const size = doc.letters.size * POINT;
    if (room.left >= size * 0.9 * text.length && room.top + room.header >= size) return box;
  }
  const strip = letterStrip(doc);
  return { x: box.x, y: box.y + strip, w: box.w, h: Math.max(1, box.h - strip) };
}

export function layoutDoc(doc: FigureDoc): DocLayout {
  const shown = letters(doc);
  const size = doc.letters.size * POINT;
  const blocks = doc.blocks.map((block): BlockLayout => {
    const text = shown.get(block.id) ?? '';
    const content = contentBox(doc, block, text);
    const blot =
      block.kind === 'grid' && block.blot
        ? blotLayout(block.blot, content, block.grid.labelSize * POINT)
        : null;
    return {
      block,
      box: { x: block.x, y: block.y, w: block.w, h: block.h },
      content,
      letter: text === '' ? null : { text, x: block.x, y: block.y + size * 0.5 },
      grid: block.kind === 'grid' ? layout(block.grid, blot ? blot.image : content) : null,
      blot,
    };
  });
  const bottom = Math.max(0, ...doc.blocks.map((b) => b.y + b.h));
  return { width: doc.width, height: Math.max(10, bottom), blocks };
}

/** The block at a page point: the one drawn last, so on top. */
export function blockAt(l: DocLayout, x: number, y: number): BlockLayout | null {
  for (let i = l.blocks.length - 1; i >= 0; i -= 1) {
    const b = l.blocks[i];
    if (b && x >= b.box.x && y >= b.box.y && x <= b.box.x + b.box.w && y <= b.box.y + b.box.h)
      return b;
  }
  return null;
}

/**
 * A grid block's height after its grid changes, so its rows keep their
 * height in mm and new labels or rows add room rather than squeeze panels.
 */
export function heightFor(doc: FigureDoc, block: GridBlock, next: Grid): number {
  const text = letters(doc).get(block.id) ?? '';
  const content = contentBox(doc, block, text);
  const size = block.grid.labelSize * POINT;
  const above = block.blot ? blotTop(block.blot, size) : 0;
  const before = layout(
    block.grid,
    block.blot ? blotLayout(block.blot, content, size).image : content,
  );
  const sum = block.grid.rows.reduce((s, h) => s + h, 0) || 1;
  const perUnit = before.rowHeights.reduce((s, h) => s + h, 0) / sum;
  const room = labelRoom(next);
  const rows = next.rows.reduce((s, h) => s + h, 0) * perUnit;
  const gaps = next.gap * Math.max(0, next.rows.length - 1);
  const after = { ...block, grid: next };
  const strip = block.h - contentBox(doc, after, text).h;
  return Math.max(4, rows + gaps + room.top + room.header + strip + above);
}

/** Lowest point of the blocks, mm: where a new block goes. */
export function bottomOf(doc: FigureDoc): number {
  return doc.blocks.length === 0 ? 0 : Math.max(...doc.blocks.map((b) => b.y + b.h)) + doc.gap;
}

// ---- Reading and writing ----

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function parseText(raw: unknown): TextBox {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    text: typeof r['text'] === 'string' ? r['text'] : '',
    size: num(r['size']) ? clamp(r['size'], 4, 48) : 8,
    align: TEXT_ALIGNS.find((a) => a === r['align']) ?? 'left',
    colour:
      typeof r['colour'] === 'string' && /^#[0-9a-f]{6}$/i.test(r['colour'])
        ? r['colour']
        : '#000000',
    upright: r['upright'] === true,
  };
}

function parseBlock(raw: unknown, pageWidth: number): Block | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!num(r['x']) || !num(r['y']) || !num(r['w']) || !num(r['h'])) return null;
  const base: BlockBase = {
    id: typeof r['id'] === 'string' ? r['id'] : newId(),
    x: clamp(r['x'], -pageWidth, pageWidth * 2),
    y: clamp(r['y'], 0, 5000),
    w: clamp(r['w'], 2, 2000),
    h: clamp(r['h'], 2, 2000),
    letter: typeof r['letter'] === 'string' ? r['letter'].slice(0, 12) : null,
  };
  if (r['kind'] === 'grid') {
    const grid = parseGrid(JSON.stringify(r['grid'] ?? null));
    return grid ? { ...base, kind: 'grid', grid, blot: parseBlot(r['blot']) } : null;
  }
  if (r['kind'] === 'text') return { ...base, kind: 'text', text: parseText(r['text']) };
  if (r['kind'] === 'table') return { ...base, kind: 'table', table: parseTable(r['table']) };
  if (r['kind'] === 'shape') return { ...base, kind: 'shape', shape: parseShape(r['shape']) };
  return null;
}

/**
 * Reads a figure's text; null if it is not a figure. A figure saved before
 * blocks (one grid filling the page) becomes a page with that grid on it,
 * looking just as it did.
 */
export function parseDoc(text: string): FigureDoc | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r['version'] !== 2) {
    const grid = parseGrid(text);
    if (!grid) return null;
    const height = layout(grid).height;
    return {
      ...newDoc(grid.width),
      letters: { form: grid.letters.form, size: grid.letters.size, show: true },
      blocks: [
        {
          id: newId(),
          kind: 'grid',
          x: 0,
          y: 0,
          w: grid.width,
          h: height,
          letter: '',
          grid,
          blot: null,
        },
      ],
    };
  }
  const width = num(r['width']) ? clamp(r['width'], 20, 600) : 174;
  const l = (r['letters'] ?? {}) as Record<string, unknown>;
  return {
    version: 2,
    width,
    gap: num(r['gap']) ? clamp(r['gap'], 0, 20) : 3,
    letters: {
      form: l['form'] === 'lower' || l['form'] === 'brackets' ? l['form'] : 'upper',
      size: num(l['size']) ? clamp(l['size'], 4, 36) : START_LETTERS.size,
      show: l['show'] !== false,
    },
    blocks: (Array.isArray(r['blocks']) ? (r['blocks'] as unknown[]) : [])
      .map((b) => parseBlock(b, width))
      .filter((b): b is Block => b !== null)
      .slice(0, 200),
  };
}

export function serialiseDoc(doc: FigureDoc): string {
  return `${JSON.stringify(doc, (_k, v: unknown) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v), 1)}\n`;
}

// ---- Changing blocks ----

export function editBlock(doc: FigureDoc, id: string, change: (b: Block) => Block): FigureDoc {
  return { ...doc, blocks: doc.blocks.map((b) => (b.id === id ? change(b) : b)) };
}

export function removeBlock(doc: FigureDoc, id: string): FigureDoc {
  return { ...doc, blocks: doc.blocks.filter((b) => b.id !== id) };
}

/** A copy of a block, a little below and right, with new ids inside. */
export function duplicate(doc: FigureDoc, id: string): { doc: FigureDoc; id: string } {
  const b = doc.blocks.find((x) => x.id === id);
  if (!b) return { doc, id };
  const copyId = newId();
  const shifted = { ...b, id: copyId, x: b.x + 4, y: b.y + 4 };
  const copy: Block =
    shifted.kind === 'grid'
      ? {
          ...shifted,
          grid: {
            ...shifted.grid,
            panels: shifted.grid.panels.map((p) => ({
              ...p,
              id: newId(),
              marks: p.marks.map((m) => ({ ...m, id: newId() })),
            })),
            headers: shifted.grid.headers.map((h) => ({ ...h, id: newId() })),
          },
        }
      : shifted;
  return { doc: { ...doc, blocks: [...doc.blocks, copy] }, id: copyId };
}

/** Moves a block to the front (drawn last) or the back. */
export function restack(doc: FigureDoc, id: string, front: boolean): FigureDoc {
  const b = doc.blocks.find((x) => x.id === id);
  if (!b) return doc;
  const rest = doc.blocks.filter((x) => x.id !== id);
  return { ...doc, blocks: front ? [...rest, b] : [b, ...rest] };
}

/**
 * A text block fitted to its words: as tall as its lines (or, reading
 * upwards, as wide), given how many lines its words wrap to.
 */
export function fitText(block: TextBlock, lineCount: number): TextBlock {
  const size = block.text.size * POINT;
  const needed = Math.max(1, lineCount) * size * 1.25 + size * 0.1;
  return block.text.upright ? { ...block, w: needed } : { ...block, h: needed };
}
