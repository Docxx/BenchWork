import type {
  BlockContent,
  Code,
  Heading,
  List,
  ListItem,
  Node as MdNode,
  PhrasingContent,
  RootContent,
  Table,
} from 'mdast';
import { RAW_BLOCK, RAW_INLINE, WIKI_LINK, type PMMark, type PMNode } from './model';

/**
 * Markdown syntax tree (mdast) to page model. Anything the editor cannot
 * show faithfully throws Unrepresentable; the caller then keeps that whole
 * top-level block as raw Markdown, exactly as written.
 */
export class Unrepresentable extends Error {}

/** `[[Target]]`, `[[Target|shown text]]` and `![[embed]]`. */
const WIKI = /(!?)\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/g;

interface Ctx {
  /** The Markdown being converted, for slicing raw source. */
  source: string;
  /** How deep inside containers we are; raw text can only be kept at the top. */
  depth: number;
}

function slice(ctx: Ctx, node: MdNode): string {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) throw new Unrepresentable('no position');
  return ctx.source.slice(start, end);
}

function withMarks(node: PMNode, marks: readonly PMMark[]): PMNode {
  return marks.length > 0 ? { ...node, marks: [...marks] } : node;
}

/** Splits plain text into text and wiki link nodes. */
function textNodes(value: string, raw: string, marks: readonly PMMark[]): PMNode[] {
  const out: PMNode[] = [];
  let last = 0;
  for (const m of value.matchAll(WIKI)) {
    // Only real links: an escaped `\[\[x]]` in the file reads as the same
    // text but must stay text.
    if (!raw.includes(m[0])) continue;
    const index = m.index;
    if (index > last) out.push(withMarks({ type: 'text', text: value.slice(last, index) }, marks));
    out.push({
      type: WIKI_LINK,
      attrs: { target: (m[2] ?? '').trim(), alias: m[3]?.trim() ?? null, embed: m[1] === '!' },
    });
    last = index + m[0].length;
  }
  if (last < value.length) out.push(withMarks({ type: 'text', text: value.slice(last) }, marks));
  return out;
}

function inline(ctx: Ctx, nodes: readonly PhrasingContent[], marks: PMMark[] = []): PMNode[] {
  const out: PMNode[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        out.push(...textNodes(node.value, slice(ctx, node), marks));
        break;
      case 'emphasis':
        out.push(...inline(ctx, node.children, [...marks, { type: 'italic' }]));
        break;
      case 'strong':
        out.push(...inline(ctx, node.children, [...marks, { type: 'bold' }]));
        break;
      case 'delete':
        out.push(...inline(ctx, node.children, [...marks, { type: 'strike' }]));
        break;
      case 'inlineCode':
        // The editor's code formatting cannot be combined with other formatting.
        out.push({ type: 'text', text: node.value, marks: [{ type: 'code' }] });
        break;
      case 'link':
        if (marks.some((m) => m.type === 'link')) throw new Unrepresentable('nested link');
        out.push(
          ...inline(ctx, node.children, [
            ...marks,
            { type: 'link', attrs: { href: node.url, title: node.title ?? null } },
          ]),
        );
        break;
      case 'image':
        out.push(
          withMarks(
            {
              type: 'image',
              attrs: { src: node.url, alt: node.alt ?? null, title: node.title ?? null },
            },
            marks.filter((m) => m.type === 'link'),
          ),
        );
        break;
      case 'break':
        out.push({ type: 'hardBreak' });
        break;
      default: {
        // Inline HTML, footnote and reference links: kept as written.
        const raw = slice(ctx, node);
        if (raw.includes('\n') && ctx.depth > 0) throw new Unrepresentable('multi-line raw');
        out.push({ type: RAW_INLINE, attrs: { markdown: raw } });
      }
    }
  }
  // Empty text nodes are not allowed in ProseMirror.
  return out.filter((n) => n.type !== 'text' || (n.text ?? '') !== '');
}

function paragraph(ctx: Ctx, children: readonly PhrasingContent[]): PMNode {
  const content = inline(ctx, children);
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
}

function listItems(ctx: Ctx, item: ListItem): PMNode[] {
  const inner = { ...ctx, depth: ctx.depth + 1 };
  const blocks = item.children.map((c) => block(inner, c));
  // Editor list items must start with a paragraph.
  if (blocks.length === 0) return [{ type: 'paragraph' }];
  if (blocks[0]?.type !== 'paragraph') throw new Unrepresentable('item without text first');
  return blocks;
}

function list(ctx: Ctx, node: List): PMNode {
  const checks = node.children.map((i) => i.checked);
  const isTask = checks.some((c) => typeof c === 'boolean');
  if (isTask && checks.some((c) => typeof c !== 'boolean')) {
    throw new Unrepresentable('mixed task list');
  }
  if (isTask) {
    if (node.ordered) throw new Unrepresentable('numbered task list');
    return {
      type: 'taskList',
      content: node.children.map((item) => ({
        type: 'taskItem',
        attrs: { checked: item.checked === true },
        content: listItems(ctx, item),
      })),
    };
  }
  const items = node.children.map((item) => ({
    type: 'listItem',
    content: listItems(ctx, item),
  }));
  return node.ordered
    ? { type: 'orderedList', attrs: { start: node.start ?? 1 }, content: items }
    : { type: 'bulletList', content: items };
}

function table(ctx: Ctx, node: Table): PMNode {
  const align = node.align ?? [];
  return {
    type: 'table',
    content: node.children.map((row, r) => ({
      type: 'tableRow',
      content: row.children.map((cell, c) => ({
        type: r === 0 ? 'tableHeader' : 'tableCell',
        attrs: { align: align[c] ?? null },
        content: [paragraph(ctx, cell.children)],
      })),
    })),
  };
}

function code(node: Code): PMNode {
  const info = [node.lang, node.meta].filter((s) => s !== null && s !== undefined).join(' ');
  return {
    type: 'codeBlock',
    attrs: { language: info === '' ? null : info },
    ...(node.value === '' ? {} : { content: [{ type: 'text', text: node.value }] }),
  };
}

function heading(ctx: Ctx, node: Heading): PMNode {
  const content = inline(ctx, node.children);
  return {
    type: 'heading',
    attrs: { level: node.depth },
    ...(content.length > 0 ? { content } : {}),
  };
}

/** An Obsidian-style callout, `> [!NOTE]`. Kept raw until callouts are supported. */
function isCallout(first: RootContent | BlockContent | undefined): boolean {
  if (first?.type !== 'paragraph') return false;
  const text = first.children[0];
  return text?.type === 'text' && /^\[!\w+\]/.test(text.value);
}

/** One block. Throws Unrepresentable for anything the editor cannot hold. */
export function block(ctx: Ctx, node: RootContent | BlockContent): PMNode {
  switch (node.type) {
    case 'paragraph':
      return paragraph(ctx, node.children);
    case 'heading':
      return heading(ctx, node);
    case 'thematicBreak':
      return { type: 'horizontalRule' };
    case 'blockquote':
      if (isCallout(node.children[0])) throw new Unrepresentable('callout');
      return {
        type: 'blockquote',
        content: node.children.map((c) => block({ ...ctx, depth: ctx.depth + 1 }, c)),
      };
    case 'list':
      return list(ctx, node);
    case 'code':
      return code(node);
    case 'table':
      return table(ctx, node);
    default:
      // HTML, definitions, footnotes and anything else: raw, at the top only.
      if (ctx.depth > 0) throw new Unrepresentable(node.type);
      return { type: RAW_BLOCK, attrs: { markdown: slice(ctx, node) } };
  }
}

/** A top-level block, or a raw block holding its exact Markdown if it cannot be shown. */
export function topLevelBlock(source: string, node: RootContent): PMNode {
  try {
    return block({ source, depth: 0 }, node);
  } catch (err) {
    if (!(err instanceof Unrepresentable)) throw err;
    const start = node.position?.start.offset ?? 0;
    const end = node.position?.end.offset ?? start;
    return { type: RAW_BLOCK, attrs: { markdown: source.slice(start, end) } };
  }
}
