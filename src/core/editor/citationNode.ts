import { InputRule, mergeAttributes, Node, type Editor, type Range } from '@tiptap/core';
import type { Node as PMNodeType } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { Suggestion, type SuggestionProps } from '@tiptap/suggestion';
import type { CitationChoice, CitedWork } from '../api';
import { citationKeys, plainCitationLabel } from './citations';
import { CITATION } from './markdown/model';

/**
 * `[@smith2024]` in the editor: a chip naming the works, such as
 * "Smith et al. 2024". The References module says what each key is; with
 * it off, chips show the keys, `@smith2024`, and the Markdown is unchanged.
 */

/** What the editor needs from the References module; null when it is off. */
export interface CitationView {
  describe(key: string): CitedWork | null;
  suggest(query: string): CitationChoice[];
  open(key: string): void | Promise<void>;
}

/** The `[@` menu: the same shape as the `[[` menu, so it shows the same way. */
export interface CiteMenuState {
  items: { id: string; label: string; detail: string }[];
  index: number;
  rect: DOMRect | null;
  choose: (index: number) => void;
}

export interface CitationOptions {
  /** Read on every use, so it follows the module being switched on and off. */
  citations: () => CitationView | null;
  onMenu: (state: CiteMenuState | null) => void;
}

/** Dispatch a transaction with this meta to redraw citations after the library changes. */
export const citationsKey = new PluginKey<{ version: number; set: DecorationSet }>('citations');

/** `[@smith2024]` just typed, but not `[[...]]`. */
const TYPED = /(?<!\[)\[([^[\]\n]*@[A-Za-z0-9_][^[\]\n]*)\]$/;

/** The chip's text and tooltip, and whether every key is known. */
export function citationDisplay(
  inner: string,
  view: CitationView | null,
): { label: string; title: string; known: boolean } {
  const keys = citationKeys(inner);
  if (view === null) return { label: plainCitationLabel(inner), title: `[${inner}]`, known: true };
  const works = keys.map((k) => view.describe(k));
  return {
    label: keys.map((k, i) => works[i]?.short ?? `@${k}`).join('; '),
    title: keys.map((k, i) => works[i]?.full ?? `@${k}: not in the library`).join('\n'),
    known: works.every((w) => w !== null),
  };
}

function marks(state: { doc: PMNodeType }, version: number): DecorationSet {
  const decorations: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name === CITATION) {
      // A changing attribute makes the chip redraw when the library changes.
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, { 'data-library': String(version) }),
      );
    }
  });
  return DecorationSet.create(state.doc, decorations);
}

function insertCitation(editor: Editor, range: Range, key: string): void {
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      { type: CITATION, attrs: { inner: `@${key}` } },
      { type: 'text', text: ' ' },
    ])
    .run();
}

export const Citation = Node.create<CitationOptions>({
  name: CITATION,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { citations: () => null, onMenu: () => undefined };
  },

  addAttributes() {
    return {
      inner: { default: '', parseHTML: (el) => el.getAttribute('data-inner') ?? '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-citation]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const inner = String(node.attrs['inner'] ?? '');
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-citation': '',
        'data-inner': inner,
        class: 'citation',
      }),
      plainCitationLabel(inner),
    ];
  },

  addNodeView() {
    const { citations } = this.options;
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.dataset['citation'] = '';
      const render = (current: PMNodeType) => {
        const shown = citationDisplay(String(current.attrs['inner'] ?? ''), citations());
        dom.className = shown.known ? 'citation' : 'citation unknown';
        dom.textContent = shown.label;
        dom.title = shown.title;
      };
      render(node);
      return {
        dom,
        update: (next) => {
          if (next.type !== node.type) return false;
          render(next);
          return true;
        },
      };
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: TYPED,
        handler: ({ state, range, match }) => {
          const inner = match[1] ?? '';
          if (citationKeys(inner).length === 0) return;
          state.tr.replaceWith(range.from, range.to, this.type.create({ inner }));
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const { citations, onMenu } = this.options;
    let menu: { props: SuggestionProps<CitationChoice, CitationChoice>; index: number } | null =
      null;

    const emit = () => {
      const m = menu;
      if (!m) {
        onMenu(null);
        return;
      }
      onMenu({
        items: m.props.items.map((c) => ({ id: c.key, label: c.label, detail: c.detail })),
        index: m.index,
        rect: m.props.clientRect?.() ?? null,
        choose: (i) => {
          const item = m.props.items[i];
          if (item) m.props.command(item);
        },
      });
    };

    return [
      new Plugin<{ version: number; set: DecorationSet }>({
        key: citationsKey,
        state: {
          init: (_, state) => ({ version: 0, set: marks(state, 0) }),
          apply: (tr, old, _before, state) => {
            if (tr.getMeta(citationsKey) !== undefined) {
              const version = old.version + 1;
              return { version, set: marks(state, version) };
            }
            return tr.docChanged ? { version: old.version, set: marks(state, old.version) } : old;
          },
        },
        props: {
          decorations: (state) => citationsKey.getState(state)?.set,
          handleClickOn: (_view, _pos, node, _nodePos, event, direct) => {
            const view = citations();
            if (!direct || node.type.name !== CITATION || view === null) return false;
            const [first] = citationKeys(String(node.attrs['inner'] ?? ''));
            if (first === undefined) return false;
            event.preventDefault();
            void view.open(first);
            return true;
          },
        },
      }),
      Suggestion<CitationChoice, CitationChoice>({
        pluginKey: new PluginKey('citeMenu'),
        editor: this.editor,
        char: '[@',
        allowSpaces: true,
        allowedPrefixes: null,
        // Only while the References module is on.
        allow: () => citations() !== null,
        items: ({ query }) => (query.includes(']') ? [] : (citations()?.suggest(query) ?? [])),
        command: ({ editor, range, props }) => {
          insertCitation(editor, range, props.key);
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
