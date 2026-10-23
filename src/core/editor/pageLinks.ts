import { Extension, InputRule, type Editor, type Range } from '@tiptap/core';
import type { Node as PMNodeType } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Suggestion, type SuggestionProps } from '@tiptap/suggestion';
import { isImage } from '../pages/attachments';
import { tagRanges } from '../search/extract';
import { isFileEmbed } from './fileEmbed';
import { WIKI_LINK } from './markdown/model';

/**
 * Links and tags in the editor:
 * - `[[` opens a menu of pages; picking one inserts a link
 * - `[[Name]]` typed in full becomes a link when the brackets close
 * - clicking a link opens its page; links to missing pages look faded
 * - `#tags` are highlighted, and clicking one searches for it
 * Tags stay plain text, so the saved Markdown never changes.
 */

export interface LinkChoice {
  id: string;
  label: string;
  /** Where the page is, or a hint such as "New page". */
  detail: string;
  /** What to write between `[[` and `]]`. */
  target: string;
}

export interface LinkMenuState {
  items: LinkChoice[];
  index: number;
  rect: DOMRect | null;
  choose: (index: number) => void;
}

export interface PageLinksOptions {
  /** Pages for the `[[` menu, best first; may end with a "create" choice. */
  suggest: (query: string) => Promise<LinkChoice[]>;
  resolves: (target: string) => boolean;
  openLink: (target: string) => void;
  openTag: (tag: string) => void;
  onMenu: (state: LinkMenuState | null) => void;
}

/** Dispatch a transaction with this meta to recheck links after pages change. */
export const pageLinksKey = new PluginKey<DecorationSet>('pageLinks');

/** `[[target]]`, `[[target|alias]]` or `![[target]]`, just typed. */
const TYPED_LINK = /(!?)\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]$/;

function isLink(node: PMNodeType): boolean {
  return node.type.name === WIKI_LINK;
}

/** Links that open a page when clicked: not image embeds, which show the image. */
function opensPage(node: PMNodeType): boolean {
  return isLink(node) && !(node.attrs['embed'] === true && isImage(String(node.attrs['target'])));
}

function decorate(state: EditorState, resolves: (target: string) => boolean): DecorationSet {
  const decorations: Decoration[] = [];
  state.doc.descendants((node, pos, parent) => {
    // Embedded files are not pages, so they are not looked for among pages.
    const file = node.attrs['embed'] === true && isFileEmbed(String(node.attrs['target']));
    if (opensPage(node) && !file && !resolves(String(node.attrs['target']))) {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'unresolved' }));
    }
    if (node.isText && parent?.type.name !== 'codeBlock') {
      if (node.marks.some((m) => m.type.name === 'code')) return;
      for (const r of tagRanges(node.text ?? '')) {
        decorations.push(
          Decoration.inline(pos + r.index, pos + r.index + r.length, {
            class: 'tag',
            'data-tag': r.tag,
          }),
        );
      }
    }
  });
  return DecorationSet.create(state.doc, decorations);
}

function insertLink(editor: Editor, range: Range, target: string): void {
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      { type: WIKI_LINK, attrs: { target, alias: null, embed: false } },
      { type: 'text', text: ' ' },
    ])
    .run();
}

export const PageLinks = Extension.create<PageLinksOptions>({
  name: 'pageLinks',

  addOptions() {
    return {
      suggest: () => Promise.resolve([]),
      resolves: () => true,
      openLink: () => undefined,
      openTag: () => undefined,
      onMenu: () => undefined,
    };
  },

  addInputRules() {
    const type = this.editor.schema.nodes[WIKI_LINK];
    if (!type) return [];
    return [
      new InputRule({
        find: TYPED_LINK,
        handler: ({ state, range, match }) => {
          const target = (match[2] ?? '').trim();
          if (target === '') return;
          const alias = match[3]?.trim() ?? null;
          state.tr.replaceWith(
            range.from,
            range.to,
            type.create({ target, alias, embed: match[1] === '!' }),
          );
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const { suggest, resolves, openLink, openTag, onMenu } = this.options;
    let menu: { props: SuggestionProps<LinkChoice, LinkChoice>; index: number } | null = null;

    const emit = () => {
      const m = menu;
      if (!m) {
        onMenu(null);
        return;
      }
      onMenu({
        items: m.props.items,
        index: m.index,
        rect: m.props.clientRect?.() ?? null,
        choose: (i) => {
          const item = m.props.items[i];
          if (item) m.props.command(item);
        },
      });
    };

    return [
      new Plugin<DecorationSet>({
        key: pageLinksKey,
        state: {
          init: (_, state) => decorate(state, resolves),
          apply: (tr, old, _before, state) =>
            tr.docChanged || tr.getMeta(pageLinksKey) !== undefined
              ? decorate(state, resolves)
              : old,
        },
        props: {
          decorations: (state) => pageLinksKey.getState(state),
          handleClickOn: (_view, _pos, node, _nodePos, event, direct) => {
            if (!direct || !opensPage(node)) return false;
            event.preventDefault();
            openLink(String(node.attrs['target']));
            return true;
          },
          handleClick: (_view, _pos, event) => {
            const tag =
              event.target instanceof Element
                ? event.target.closest<HTMLElement>('.tag')?.dataset['tag']
                : undefined;
            if (tag === undefined) return false;
            openTag(tag);
            return true;
          },
        },
      }),
      Suggestion<LinkChoice, LinkChoice>({
        pluginKey: new PluginKey('linkMenu'),
        editor: this.editor,
        char: '[[',
        allowSpaces: true,
        allowedPrefixes: null,
        items: ({ query }) => (query.includes(']') ? [] : suggest(query)),
        command: ({ editor, range, props }) => {
          insertLink(editor, range, props.target);
        },
        render: () => ({
          onStart: (props) => {
            menu = { props, index: 0 };
            emit();
          },
          onUpdate: (props) => {
            if (!menu) return;
            menu = { props, index: Math.min(menu.index, Math.max(0, props.items.length - 1)) };
            emit();
          },
          onKeyDown: ({ event }) => {
            if (!menu) return false;
            const count = menu.props.items.length;
            switch (event.key) {
              case 'ArrowDown':
                menu.index = (menu.index + 1) % Math.max(1, count);
                emit();
                return true;
              case 'ArrowUp':
                menu.index = (menu.index - 1 + count) % Math.max(1, count);
                emit();
                return true;
              case 'Enter':
              case 'Tab': {
                const item = menu.props.items[menu.index];
                if (!item) return false;
                menu.props.command(item);
                return true;
              }
              case 'Escape':
                menu = null;
                onMenu(null);
                return true;
              default:
                return false;
            }
          },
          onExit: () => {
            menu = null;
            onMenu(null);
          },
        }),
      }),
    ];
  },
});
