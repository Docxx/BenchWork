import { Extension, getSchema, mergeAttributes, Node, type AnyExtension } from '@tiptap/core';
import { Image } from '@tiptap/extension-image';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { Placeholder } from '@tiptap/extensions';
import type { Schema } from '@tiptap/pm/model';
import { StarterKit } from '@tiptap/starter-kit';
import { RAW_BLOCK, RAW_INLINE, SOURCE_ATTR, WIKI_LINK } from './markdown/model';

/**
 * The editor's building blocks. The same list defines the document schema,
 * so the Markdown converters, the Yjs document and the editor always agree.
 */

/** Block types that can sit at the top of a page and remember their Markdown. */
const TOP_LEVEL_TYPES = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'taskList',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'table',
  RAW_BLOCK,
];

/** Hidden attributes: each block's original Markdown, and table column alignment. */
const BenchWorkAttributes = Extension.create({
  name: 'benchworkAttributes',
  addGlobalAttributes() {
    return [
      {
        types: TOP_LEVEL_TYPES,
        attributes: {
          // A split or new block must not inherit another block's source.
          [SOURCE_ATTR]: { default: null, keepOnSplit: false, rendered: false },
        },
      },
      {
        types: ['tableCell', 'tableHeader'],
        attributes: {
          align: {
            default: null,
            keepOnSplit: false,
            parseHTML: (el) => el.style.textAlign || null,
            renderHTML: (attrs) =>
              typeof attrs['align'] === 'string' ? { style: `text-align: ${attrs['align']}` } : {},
          },
        },
      },
    ];
  },
});

/** Markdown the editor cannot show yet, kept and saved exactly as written. */
const RawBlock = Node.create({
  name: RAW_BLOCK,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { markdown: { default: '', rendered: false } };
  },
  parseHTML() {
    return [{ tag: 'pre[data-raw-markdown]', getAttrs: (el) => ({ markdown: el.textContent }) }];
  },
  renderHTML({ node }) {
    return [
      'pre',
      { 'data-raw-markdown': '', class: 'raw-block', title: 'Markdown kept as written' },
      String(node.attrs['markdown'] ?? ''),
    ];
  },
});

const RawInline = Node.create({
  name: RAW_INLINE,
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return { markdown: { default: '', rendered: false } };
  },
  parseHTML() {
    return [{ tag: 'code[data-raw-markdown]', getAttrs: (el) => ({ markdown: el.textContent }) }];
  },
  renderHTML({ node }) {
    return [
      'code',
      { 'data-raw-markdown': '', class: 'raw-inline', title: 'Markdown kept as written' },
      String(node.attrs['markdown'] ?? ''),
    ];
  },
});

/** `[[Page]]`, `[[Page|shown text]]` or an embed `![[file]]`, shown as a chip. */
export const WikiLink = Node.create({
  name: WIKI_LINK,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      target: { default: '', parseHTML: (el) => el.getAttribute('data-target') ?? '' },
      alias: { default: null, parseHTML: (el) => el.getAttribute('data-alias') },
      embed: { default: false, parseHTML: (el) => el.hasAttribute('data-embed') },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-wiki-link]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const target = String(node.attrs['target'] ?? '');
    const alias = node.attrs['alias'] as string | null;
    const embed = node.attrs['embed'] === true;
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-wiki-link': '',
        'data-target': target,
        ...(alias ? { 'data-alias': alias } : {}),
        ...(embed ? { 'data-embed': '' } : {}),
        class: embed ? 'wiki-link embed' : 'wiki-link',
        title: target,
      }),
      alias ?? target,
    ];
  },
});

export const PLACEHOLDER = 'Type / for headings, lists, tables and more';

/** Everything except collaboration, which needs the page's Yjs document. */
export function baseExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      // Undo and redo come from the Yjs document instead.
      undoRedo: false,
      // Markdown has no underline.
      underline: false,
      link: { openOnClick: false, autolink: true, linkOnPaste: true },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Image.configure({ inline: true, allowBase64: false }),
    Placeholder.configure({ placeholder: PLACEHOLDER }),
    BenchWorkAttributes,
    RawBlock,
    RawInline,
    WikiLink,
  ];
}

let cachedSchema: Schema | null = null;

/** The page document schema. */
export function pageSchema(): Schema {
  cachedSchema ??= getSchema(baseExtensions());
  return cachedSchema;
}
