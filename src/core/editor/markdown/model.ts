/**
 * The page model: ProseMirror JSON, using TipTap's node and mark names, plus
 * BenchWork's own nodes. The Markdown converters read and write this, and
 * the editor loads it into a Yjs document.
 */

export interface PMMark {
  type: MarkName;
  attrs?: Record<string, unknown>;
}

export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  text?: string;
  marks?: PMMark[];
}

export type MarkName = 'link' | 'strike' | 'highlight' | 'underline' | 'bold' | 'italic' | 'code';

/** Outermost first. Fixed, so the same marks always nest the same way. */
export const MARK_ORDER: readonly MarkName[] = [
  'link',
  'strike',
  'highlight',
  'underline',
  'bold',
  'italic',
  'code',
];

/**
 * Kept on each top-level block: its original Markdown, the Markdown it
 * would be written as now, and the text between it and the block before.
 * If a block still writes as `norm` when saving, `src` is written instead,
 * so untouched parts of a page stay exactly as they were.
 */
export interface BlockSource {
  src: string;
  norm: string;
  /** Whitespace before this block in the original file. */
  sep: string;
  /** Position among the original blocks, to know which neighbours were adjacent. */
  index: number;
}

/** What is around the blocks: text before the first and after the last. */
export interface BodySource {
  leading: string;
  trailing: string;
}

export const RAW_BLOCK = 'rawBlock';
export const RAW_INLINE = 'rawInline';
export const WIKI_LINK = 'wikiLink';
/** `[@key]`: a citation, kept as written between its brackets in `inner`. */
export const CITATION = 'citation';

/**
 * A box on a free layout page: blocks placed at x, y with a width, and
 * optionally a height and a colour (a sticky note). In Markdown, a hidden
 * comment before the box's blocks gives its place:
 *
 *   <!-- box x=40 y=120 w=420 h=180 colour=yellow -->
 */
export const BOX = 'box';

export const BOX_COLOURS = ['yellow', 'pink', 'green', 'blue', 'purple'] as const;
export type BoxColour = (typeof BOX_COLOURS)[number];

export interface BoxAttrs {
  x: number;
  y: number;
  w: number;
  /** 0: as tall as its text. */
  h: number;
  colour: BoxColour | null;
}

export const DEFAULT_BOX_WIDTH = 420;

const BOX_MARKER = /^<!--\s*box((?:\s+[a-z]+=[\w-]+)*)\s*-->$/;

/** A box's place from its marker comment, or null if `markdown` is not one. */
export function parseBoxMarker(markdown: string): BoxAttrs | null {
  const m = BOX_MARKER.exec(markdown.trim());
  if (!m) return null;
  const values = new Map(
    (m[1] ?? '')
      .trim()
      .split(/\s+/)
      .filter((pair) => pair !== '')
      .map((pair) => pair.split('=') as [string, string]),
  );
  const number = (key: string, fallback: number) => {
    const v = Number(values.get(key));
    return Number.isFinite(v) ? Math.round(v) : fallback;
  };
  const colour = values.get('colour');
  return {
    x: Math.max(0, number('x', 0)),
    y: Math.max(0, number('y', 0)),
    w: Math.max(40, number('w', DEFAULT_BOX_WIDTH)),
    h: Math.max(0, number('h', 0)),
    colour: (BOX_COLOURS as readonly string[]).includes(colour ?? '')
      ? (colour as BoxColour)
      : null,
  };
}

/** The marker comment for a box. */
export function boxMarker(attrs: Partial<BoxAttrs>): string {
  const n = (v: unknown, fallback: number) => (typeof v === 'number' ? Math.round(v) : fallback);
  const parts = [
    `x=${String(n(attrs.x, 0))}`,
    `y=${String(n(attrs.y, 0))}`,
    `w=${String(n(attrs.w, DEFAULT_BOX_WIDTH))}`,
  ];
  const h = n(attrs.h, 0);
  if (h > 0) parts.push(`h=${String(h)}`);
  if (typeof attrs.colour === 'string') parts.push(`colour=${attrs.colour}`);
  return `<!-- box ${parts.join(' ')} -->`;
}

/** Attribute name for BlockSource on top-level blocks. */
export const SOURCE_ATTR = 'md';

/**
 * Reads a block's BlockSource. It is stored as a JSON string, because Yjs
 * (which holds the editor's document) keeps attributes most reliably as text.
 */
export function blockSource(node: PMNode): BlockSource | null {
  const raw = node.attrs?.[SOURCE_ATTR];
  if (typeof raw !== 'string' || raw === '') return null;
  try {
    const v = JSON.parse(raw) as Partial<BlockSource>;
    return typeof v.src === 'string' && typeof v.norm === 'string'
      ? { src: v.src, norm: v.norm, sep: v.sep ?? '\n\n', index: v.index ?? -1 }
      : null;
  } catch {
    return null;
  }
}

export function encodeBlockSource(source: BlockSource): string {
  return JSON.stringify(source);
}

export function emptyDoc(): PMNode {
  return { type: 'doc', content: [] };
}
