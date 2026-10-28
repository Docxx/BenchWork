import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { pageProperties, parsePage, serialisePage, type ParsedPage } from '../../pages/frontmatter';
import {
  blockSource,
  BOX,
  boxMarker,
  encodeBlockSource,
  parseBoxMarker,
  RAW_BLOCK,
  SOURCE_ATTR,
  type BoxAttrs,
  type BlockSource,
  type BodySource,
  type PMNode,
} from './model';
import { topLevelBlock } from './toDoc';
import { blockToMarkdown, MARKDOWN_STYLE } from './toMarkdown';

/**
 * Markdown on disk <-> the page model in the editor.
 *
 * Every top-level block keeps the Markdown it came from. On save, a block
 * that still writes the same as when it was read is written back exactly as
 * it was; only edited blocks take BenchWork's own style. So editing one
 * paragraph never reformats the rest of the page.
 */

export interface LoadedBody {
  doc: PMNode;
  source: BodySource;
}

export function parseBody(body: string): LoadedBody {
  const text = body.replace(/\r\n/g, '\n');
  const tree = fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const children = tree.children;
  const content: PMNode[] = [];
  let prevEnd = 0;

  children.forEach((child, index) => {
    const start = child.position?.start.offset ?? prevEnd;
    const end = child.position?.end.offset ?? start;
    const node = topLevelBlock(text, child);
    const md: BlockSource = {
      src: text.slice(start, end),
      norm: blockToMarkdown(node),
      sep: index === 0 ? '' : text.slice(prevEnd, start),
      index,
    };
    content.push({ ...node, attrs: { ...node.attrs, [SOURCE_ATTR]: encodeBlockSource(md) } });
    prevEnd = end;
  });

  const first = children[0]?.position?.start.offset;
  return {
    doc: { type: 'doc', content: groupBoxes(content) },
    source: {
      leading: first === undefined ? text : text.slice(0, first),
      trailing: first === undefined ? '' : text.slice(prevEnd),
    },
  };
}

/** Where text written before a free page's first box goes. */
const LEADING_BOX: BoxAttrs = { x: 40, y: 40, w: 640, h: 0, colour: null };

function markerOf(node: PMNode): BoxAttrs | null {
  if (node.type !== RAW_BLOCK) return null;
  const markdown = node.attrs?.['markdown'];
  return typeof markdown === 'string' ? parseBoxMarker(markdown) : null;
}

/**
 * On a free layout page, each box marker and the blocks after it, up to
 * the next marker, become one box. A page with no markers is unchanged.
 */
function groupBoxes(blocks: PMNode[]): PMNode[] {
  if (!blocks.some((b) => markerOf(b) !== null)) return blocks;
  const boxes: PMNode[] = [];
  let current: PMNode | null = null;
  for (const block of blocks) {
    const place = markerOf(block);
    if (place !== null) {
      current = {
        type: BOX,
        attrs: { ...place, [SOURCE_ATTR]: block.attrs?.[SOURCE_ATTR] },
        content: [],
      };
      boxes.push(current);
      continue;
    }
    if (current === null) {
      current = { type: BOX, attrs: { ...LEADING_BOX }, content: [] };
      boxes.push(current);
    }
    current.content?.push(block);
  }
  // A box holds at least one block: an empty sticky note holds an empty paragraph.
  return boxes.map((b) =>
    (b.content ?? []).length > 0 ? b : { ...b, content: [{ type: 'paragraph' }] },
  );
}

const LIST_TYPES = new Set(['bulletList', 'taskList', 'orderedList']);

/** The bullet or number style a written list starts with, such as `-` or `1.`. */
function listMarker(markdown: string): string | null {
  const m = /^\s*([-*+]|\d+[.)])/.exec(markdown);
  return m?.[1]?.replace(/\d+/, '1') ?? null;
}

/**
 * Two lists of the same kind next to each other would merge into one in
 * Markdown, so the second one uses the other bullet (or `)` numbering).
 */
function separatedList(node: PMNode, plain: string, previous: string | null): string {
  if (!LIST_TYPES.has(node.type) || previous === null) return plain;
  const mine = listMarker(plain);
  if (mine === null || mine !== listMarker(previous)) return plain;
  const ordered = node.type === 'orderedList';
  return blockToMarkdown(node, {
    ...MARKDOWN_STYLE,
    ...(ordered
      ? { bulletOrdered: ')' }
      : mine === '-'
        ? { bullet: '*', bulletOther: '-' }
        : { bullet: '-', bulletOther: '*' }),
  });
}

interface Written {
  out: string;
  unchanged: boolean;
  index: number;
  list: boolean;
}

export function serialiseBody(doc: PMNode, source: BodySource): string {
  const parts: string[] = [];
  let previous: Written | null = null;

  /** Writes one block; `firstInBox` puts it on the line after its box's marker. */
  const write = (node: PMNode, firstInBox: boolean): boolean => {
    const plain = blockToMarkdown(node);
    if (plain === '') return false; // empty paragraphs are not written
    const md = blockSource(node);
    const unchanged = md !== null && plain === md.norm;
    let out = unchanged ? md.src : plain;
    if (!unchanged && previous?.list) out = separatedList(node, out, previous.out);

    // Keep the original spacing between two untouched neighbours.
    const keepSep =
      unchanged && previous !== null && previous.unchanged && previous.index === md.index - 1;
    const sep = parts.length === 0 ? '' : keepSep ? md.sep : firstInBox ? '\n' : '\n\n';
    parts.push(sep + out);
    previous = { out, unchanged, index: md?.index ?? -1, list: LIST_TYPES.has(node.type) };
    return true;
  };

  for (const node of doc.content ?? []) {
    if (node.type !== BOX) {
      write(node, false);
      continue;
    }
    // A box: its marker, kept as written while its place is the same, then its blocks.
    const md = blockSource(node);
    const marker = boxMarker(node.attrs ?? {});
    const kept = md === null ? null : parseBoxMarker(md.src);
    const unchanged = md !== null && kept !== null && boxMarker(kept) === marker;
    const out = unchanged ? md.src : marker;
    const keepSep =
      unchanged && previous !== null && previous.unchanged && previous.index === md.index - 1;
    parts.push((parts.length === 0 ? '' : keepSep ? md.sep : '\n\n') + out);
    previous = { out, unchanged, index: md?.index ?? -1, list: false };
    let first = true;
    for (const child of node.content ?? []) {
      if (write(child, first)) first = false;
    }
  }

  // No blocks left: keep any original whitespace, so an untouched blank page stays as it was.
  if (parts.length === 0) return source.leading + source.trailing;
  return `${source.leading}${parts.join('')}${source.trailing === '' ? '\n' : source.trailing}`;
}

/** A whole page: frontmatter, plus the body as an editor document. */
export interface LoadedPage extends LoadedBody {
  page: ParsedPage;
}

export function loadPage(text: string): LoadedPage {
  const page = parsePage(text);
  const loaded = parseBody(page.body);
  // A free layout page without boxes yet (new, or switched elsewhere): its blocks in one box.
  const free = page.error === null && pageProperties(page)['layout'] === 'free';
  const content = loaded.doc.content ?? [];
  if (free && content[0]?.type !== BOX) {
    const box: PMNode = {
      type: BOX,
      attrs: { ...LEADING_BOX },
      content: content.length > 0 ? content : [{ type: 'paragraph' }],
    };
    return { page, ...loaded, doc: { ...loaded.doc, content: [box] } };
  }
  return { page, ...loaded };
}

/** The page's file text after editing, in the page's own line endings. */
export function savePage(page: ParsedPage, doc: PMNode, source: BodySource): string {
  const body = serialiseBody(doc, source);
  return serialisePage({ ...page, body: page.eol === '\r\n' ? body.replace(/\n/g, '\r\n') : body });
}

/**
 * Markdown as new blocks for inserting into a page, such as a template.
 * They carry no remembered Markdown, so they save in BenchWork's style.
 */
export function blocksFromMarkdown(markdown: string): PMNode[] {
  const fresh = (block: PMNode): PMNode => ({
    ...block,
    attrs: Object.fromEntries(Object.entries(block.attrs ?? {}).filter(([k]) => k !== SOURCE_ATTR)),
    ...(block.type === BOX ? { content: (block.content ?? []).map(fresh) } : {}),
  });
  return (parseBody(markdown).doc.content ?? []).map(fresh);
}
