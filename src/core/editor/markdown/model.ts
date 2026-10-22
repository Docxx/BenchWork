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

export type MarkName = 'link' | 'strike' | 'bold' | 'italic' | 'code';

/** Outermost first. Fixed, so the same marks always nest the same way. */
export const MARK_ORDER: readonly MarkName[] = ['link', 'strike', 'bold', 'italic', 'code'];

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
