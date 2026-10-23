import { Extension, getSchema, mergeAttributes, Node, type AnyExtension } from '@tiptap/core';
import { Image, type ImageOptions } from '@tiptap/extension-image';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { Placeholder } from '@tiptap/extensions';
import type { Schema } from '@tiptap/pm/model';
import { StarterKit } from '@tiptap/starter-kit';
import { isImage } from '../pages/attachments';
import { joinLabel, splitLabel } from './imageSize';
import { fileEmbedElement, isFileEmbed, type TableLoader } from './fileEmbed';
import { imageView } from './imageView';
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

/**
 * Turns image sources into URLs the page can load. The editor gets one for
 * the open page; without one, images show as chips and plain `<img>`s.
 */
export interface AssetResolver {
  /** For `![[target]]` embeds. */
  embed(target: string): string | null;
  /** For Markdown images, `![](src)`. */
  image(src: string): string | null;
  /** The first rows of an embedded table, for its card. */
  table?: TableLoader;
}

interface AssetOptions {
  assets: AssetResolver | null;
}

/** The chip for a link or a non-image embed. */
function chipElement(target: string, alias: string | null, embed: boolean): HTMLElement {
  const chip = document.createElement('span');
  chip.dataset['wikiLink'] = '';
  chip.dataset['target'] = target;
  if (alias) chip.dataset['alias'] = alias;
  if (embed) chip.dataset['embed'] = '';
  chip.className = embed ? 'wiki-link embed' : 'wiki-link';
  chip.title = target;
  chip.textContent = alias ?? target;
  return chip;
}

/** The crossed-out chip shown for an image whose file cannot be loaded. */
function missingChip(label: string): HTMLElement {
  const chip = chipElement(label, null, true);
  chip.classList.add('missing');
  chip.title = `Not found: ${label}`;
  return chip;
}

/** `[[Page]]`, `[[Page|shown text]]` or an embed `![[file]]`, shown as a chip. */
export const WikiLink = Node.create<AssetOptions>({
  name: WIKI_LINK,
  addOptions() {
    return { assets: null };
  },
  // Image embeds show the image, resizable; everything else is a chip, as renderHTML.
  addNodeView() {
    const assets = this.options.assets;
    if (assets === null) return null;
    return ({ node, editor, getPos }) => {
      const target = String(node.attrs['target'] ?? '');
      const alias = node.attrs['alias'] as string | null;
      const embed = node.attrs['embed'] === true;
      if (embed && isImage(target)) {
        // `![[plot.png|300]]`: the alias holds the size, and maybe a caption.
        const { caption, size } = splitLabel(alias);
        return imageView(
          { node, editor, getPos },
          {
            url: assets.embed(target),
            label: caption || target,
            title: caption || null,
            size,
            withSize: (next) => ({ ...node.attrs, alias: joinLabel(caption, next) }),
            missing: () => missingChip(target),
          },
        );
      }
      if (embed && isFileEmbed(target)) {
        const card = fileEmbedElement(target, alias, assets.table ?? null);
        return {
          dom: card.dom,
          update: (next) => next.type === node.type && next.attrs === node.attrs,
          destroy: card.destroy,
        };
      }
      const wrapper = document.createElement('span');
      wrapper.className = 'wiki-link-view';
      wrapper.append(chipElement(target, alias, embed));
      return {
        dom: wrapper,
        update: (next) => next.type === node.type && next.attrs === node.attrs,
      };
    };
  },
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  // Links and images can be dragged to another place in the page.
  draggable: true,
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

/** Markdown images, with their source read from the page's folder. */
const PageImage = Image.extend<ImageOptions & AssetOptions>({
  addOptions() {
    return { ...(this.parent?.() as ImageOptions), assets: null };
  },
  draggable: true,
  addNodeView() {
    const assets = this.options.assets;
    if (assets === null) return null;
    return ({ node, editor, getPos }) => {
      const src = String(node.attrs['src'] ?? '');
      // `![graph|300](plot.png)`: the alt text holds the size after its caption.
      const { caption, size } = splitLabel(node.attrs['alt'] as string | null);
      return imageView(
        { node, editor, getPos },
        {
          url: assets.image(src),
          label: caption || src,
          title: node.attrs['title'] as string | null,
          size,
          withSize: (next) => ({ ...node.attrs, alt: joinLabel(caption, next) }),
          missing: () => missingChip(caption || src),
        },
      );
    };
  },
});

export const PLACEHOLDER = 'Type / for headings, lists, tables and more';

/**
 * Everything except collaboration, which needs the page's Yjs document.
 * `assets` only changes how images are shown, never the schema.
 */
export function baseExtensions(assets: AssetResolver | null = null): AnyExtension[] {
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
    PageImage.configure({ inline: true, allowBase64: false, assets }),
    Placeholder.configure({ placeholder: PLACEHOLDER }),
    BenchWorkAttributes,
    RawBlock,
    RawInline,
    WikiLink.configure({ assets }),
  ];
}

let cachedSchema: Schema | null = null;

/** The page document schema. */
export function pageSchema(): Schema {
  cachedSchema ??= getSchema(baseExtensions());
  return cachedSchema;
}
