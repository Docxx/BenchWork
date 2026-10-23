import type {
  BlockContent,
  ListItem,
  Node as MdNode,
  PhrasingContent,
  Root,
  TableCell,
  TableRow,
  Text,
} from 'mdast';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { defaultHandlers, toMarkdown, type Handle, type Options } from 'mdast-util-to-markdown';
import {
  CITATION,
  MARK_ORDER,
  RAW_BLOCK,
  RAW_INLINE,
  WIKI_LINK,
  type PMMark,
  type PMNode,
} from './model';

/** Markdown kept exactly as written: raw blocks and raw inline bits. */
interface RawNode extends MdNode {
  type: 'bwRaw';
  value: string;
}

interface CitationNode extends MdNode {
  type: 'citation';
  inner: string;
}

interface WikiLinkNode extends MdNode {
  type: 'wikiLink';
  target: string;
  alias: string | null;
  embed: boolean;
}

declare module 'mdast' {
  interface PhrasingContentMap {
    bwRaw: RawNode;
    wikiLink: WikiLinkNode;
    citation: CitationNode;
  }
  interface RootContentMap {
    bwRaw: RawNode;
    wikiLink: WikiLinkNode;
    citation: CitationNode;
  }
  interface BlockContentMap {
    bwRaw: RawNode;
  }
}

const rawHandler: Handle = (node) => (node as RawNode).value;

/** Citations are written back exactly as they were typed between the brackets. */
const citationHandler: Handle = (node) => `[${(node as CitationNode).inner}]`;

const wikiHandler: Handle = (node) => {
  const n = node as WikiLinkNode;
  return `${n.embed ? '!' : ''}[[${n.target}${n.alias ? `|${n.alias}` : ''}]]`;
};

/**
 * Text as Markdown, but without escaping `#` before a tag at the start of a
 * line: `#todo` is not a heading (a heading needs a space after the `#`).
 */
const textHandler: Handle = (node, parent, state, info) =>
  defaultHandlers
    .text(node as Text, parent, state, info)
    .replace(/(^|\n)( {0,3})\\#(?=[^\s#\\])/g, '$1$2#');

/**
 * BenchWork's Markdown style for blocks that have changed. Unchanged blocks
 * keep their original text, so this only shows where someone has edited.
 */
export const MARKDOWN_STYLE: Options = {
  bullet: '-',
  bulletOther: '*',
  bulletOrdered: '.',
  emphasis: '*',
  strong: '*',
  fence: '`',
  rule: '-',
  listItemIndent: 'one',
  incrementListMarker: true,
  extensions: [gfmToMarkdown({ tablePipeAlign: false })],
  handlers: {
    bwRaw: rawHandler,
    wikiLink: wikiHandler,
    citation: citationHandler,
    text: textHandler,
  },
};

/** A string attribute, or '' if it is missing or not a string. */
function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// ---- Inline ----

function markKey(mark: PMMark): string {
  return mark.type === 'link'
    ? `link ${String(mark.attrs?.['href'])} ${String(mark.attrs?.['title'])}`
    : mark.type;
}

function sortedMarks(marks: readonly PMMark[] | undefined): PMMark[] {
  return [...(marks ?? [])].sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
}

function markNode(mark: PMMark, children: PhrasingContent[]): PhrasingContent {
  switch (mark.type) {
    case 'link': {
      const title = mark.attrs?.['title'];
      return {
        type: 'link',
        url: str(mark.attrs?.['href']),
        title: typeof title === 'string' ? title : null,
        children,
      };
    }
    case 'bold':
      return { type: 'strong', children };
    case 'italic':
      return { type: 'emphasis', children };
    default:
      return { type: 'delete', children };
  }
}

function leaf(node: PMNode, inTable: boolean): PhrasingContent | null {
  switch (node.type) {
    case 'text':
      return (node.marks ?? []).some((m) => m.type === 'code')
        ? { type: 'inlineCode', value: node.text ?? '' }
        : { type: 'text', value: node.text ?? '' };
    case 'hardBreak':
      // Tables cannot hold line breaks in Markdown.
      return inTable ? { type: 'bwRaw', value: '<br>' } : { type: 'break' };
    case 'image': {
      const a = node.attrs ?? {};
      return {
        type: 'image',
        url: str(a['src']),
        alt: typeof a['alt'] === 'string' ? a['alt'] : null,
        title: typeof a['title'] === 'string' ? a['title'] : null,
      };
    }
    case WIKI_LINK: {
      const a = node.attrs ?? {};
      return {
        type: 'wikiLink',
        target: str(a['target']),
        alias: typeof a['alias'] === 'string' && a['alias'] !== '' ? a['alias'] : null,
        embed: a['embed'] === true,
      };
    }
    case CITATION:
      return { type: 'citation', inner: str(node.attrs?.['inner']) };
    case RAW_INLINE:
      return { type: 'bwRaw', value: str(node.attrs?.['markdown']) };
    default:
      return node.text ? { type: 'text', value: node.text } : null;
  }
}

/**
 * Turns ProseMirror's flat runs of marked text back into nested Markdown
 * nodes, keeping runs that share outer marks inside the same node.
 */
export function phrasing(nodes: readonly PMNode[], inTable = false): PhrasingContent[] {
  const root: PhrasingContent[] = [];
  const stack: { key: string; children: PhrasingContent[] }[] = [{ key: '', children: root }];

  for (const node of nodes) {
    const marks = sortedMarks(node.marks).filter((m) => m.type !== 'code');
    let k = 0;
    while (k < marks.length && k + 1 < stack.length) {
      const mark = marks[k];
      if (!mark || stack[k + 1]?.key !== markKey(mark)) break;
      k += 1;
    }
    stack.length = k + 1;
    for (const mark of marks.slice(k)) {
      const children: PhrasingContent[] = [];
      stack[stack.length - 1]?.children.push(markNode(mark, children));
      stack.push({ key: markKey(mark), children });
    }
    const item = leaf(node, inTable);
    if (item) stack[stack.length - 1]?.children.push(item);
  }
  return root;
}

// ---- Blocks ----

function blocks(nodes: readonly PMNode[] | undefined): BlockContent[] {
  return (nodes ?? []).map(toMdastBlock).filter((b): b is BlockContent => b !== null);
}

function listItem(node: PMNode, checked: boolean | null): ListItem {
  return { type: 'listItem', spread: false, checked, children: blocks(node.content) };
}

function cellText(cell: PMNode): PhrasingContent[] {
  // A Markdown table cell holds one line: paragraphs are joined with a space.
  const parts = (cell.content ?? []).map((p) => phrasing(p.content ?? [], true));
  return parts.flatMap((p, i) => (i === 0 ? p : [{ type: 'text' as const, value: ' ' }, ...p]));
}

function toMdastBlock(node: PMNode): BlockContent | null {
  const content = node.content ?? [];
  switch (node.type) {
    case 'paragraph':
      return { type: 'paragraph', children: phrasing(content) };
    case 'heading': {
      const level = Number(node.attrs?.['level'] ?? 1);
      const depth = Math.min(6, Math.max(1, level)) as 1 | 2 | 3 | 4 | 5 | 6;
      return { type: 'heading', depth, children: phrasing(content) };
    }
    case 'blockquote':
      return { type: 'blockquote', children: blocks(content) };
    case 'bulletList':
      return {
        type: 'list',
        ordered: false,
        spread: false,
        children: content.map((i) => listItem(i, null)),
      };
    case 'orderedList':
      return {
        type: 'list',
        ordered: true,
        start: Number(node.attrs?.['start'] ?? 1),
        spread: false,
        children: content.map((i) => listItem(i, null)),
      };
    case 'taskList':
      return {
        type: 'list',
        ordered: false,
        spread: false,
        children: content.map((i) => listItem(i, i.attrs?.['checked'] === true)),
      };
    case 'codeBlock': {
      const info = typeof node.attrs?.['language'] === 'string' ? node.attrs['language'] : '';
      const [lang = '', ...meta] = info.split(' ');
      return {
        type: 'code',
        lang: lang === '' ? null : lang,
        meta: meta.length > 0 ? meta.join(' ') : null,
        value: content.map((t) => t.text ?? '').join(''),
      };
    }
    case 'horizontalRule':
      return { type: 'thematicBreak' };
    case 'table': {
      const rows: TableRow[] = content.map((row) => ({
        type: 'tableRow',
        children: (row.content ?? []).map((cell): TableCell => ({
          type: 'tableCell',
          children: cellText(cell),
        })),
      }));
      const align = (content[0]?.content ?? []).map((cell) => {
        const a = cell.attrs?.['align'];
        return a === 'left' || a === 'right' || a === 'center' ? a : null;
      });
      return { type: 'table', align, children: rows };
    }
    case RAW_BLOCK:
      return { type: 'bwRaw', value: str(node.attrs?.['markdown']) };
    case 'image':
      return { type: 'paragraph', children: phrasing([node]) };
    default:
      return content.length > 0 ? { type: 'paragraph', children: phrasing(content) } : null;
  }
}

/** One top-level block as Markdown, with no trailing newline. '' if it is empty. */
export function blockToMarkdown(node: PMNode, style: Options = MARKDOWN_STYLE): string {
  const mdast = toMdastBlock(node);
  if (mdast === null) return '';
  if (mdast.type === 'paragraph' && mdast.children.length === 0) return '';
  const root: Root = { type: 'root', children: [mdast] };
  return toMarkdown(root, style).replace(/\n+$/, '');
}
