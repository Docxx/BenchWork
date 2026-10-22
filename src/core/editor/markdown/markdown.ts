import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { parsePage, serialisePage, type ParsedPage } from '../../pages/frontmatter';
import { blockSource, SOURCE_ATTR, type BlockSource, type BodySource, type PMNode } from './model';
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
    content.push({ ...node, attrs: { ...node.attrs, [SOURCE_ATTR]: md } });
    prevEnd = end;
  });

  const first = children[0]?.position?.start.offset;
  return {
    doc: { type: 'doc', content },
    source: {
      leading: first === undefined ? text : text.slice(0, first),
      trailing: first === undefined ? '' : text.slice(prevEnd),
    },
  };
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

export function serialiseBody(doc: PMNode, source: BodySource): string {
  const parts: string[] = [];
  let previous: { out: string; unchanged: boolean; index: number; list: boolean } | null = null;

  for (const node of doc.content ?? []) {
    const plain = blockToMarkdown(node);
    if (plain === '') continue; // empty paragraphs are not written
    const md = blockSource(node);
    const unchanged = md !== null && plain === md.norm;
    let out = unchanged ? md.src : plain;
    if (!unchanged && previous?.list) out = separatedList(node, out, previous.out);

    // Keep the original spacing between two untouched neighbours.
    const keepSep =
      unchanged && previous !== null && previous.unchanged && previous.index === md.index - 1;
    const sep = parts.length === 0 ? '' : keepSep ? md.sep : '\n\n';
    parts.push(sep + out);
    previous = { out, unchanged, index: md?.index ?? -1, list: LIST_TYPES.has(node.type) };
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
  return { page, ...parseBody(page.body) };
}

/** The page's file text after editing, in the page's own line endings. */
export function savePage(page: ParsedPage, doc: PMNode, source: BodySource): string {
  const body = serialiseBody(doc, source);
  return serialisePage({ ...page, body: page.eol === '\r\n' ? body.replace(/\n/g, '\r\n') : body });
}
