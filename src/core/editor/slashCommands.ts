import { Extension, type Editor, type Range } from '@tiptap/core';
import { Suggestion, type SuggestionProps } from '@tiptap/suggestion';

/**
 * The `/` menu: type `/` at the start of a line or after a space, then a few
 * letters, to turn the line into a heading, list, table and so on.
 */

export interface SlashItem {
  id: string;
  label: string;
  /** Extra words that find this item, such as "h1" for Heading 1. */
  keywords: string[];
  run: (editor: Editor, range: Range) => void;
}

/** The item that inserts a template; the editor asks which one. */
export const TEMPLATE_ITEM = 'template';
/** The item that shows the page's properties with a new one to fill in. */
export const PROPERTY_ITEM = 'property';
/** The item that adds a file from a file picker. */
export const FILE_ITEM = 'file';

const chain = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: 'text',
    label: 'Text',
    keywords: ['paragraph', 'plain'],
    run: (e, r) => chain(e, r).setParagraph().run(),
  },
  {
    id: 'heading1',
    label: 'Heading 1',
    keywords: ['h1', 'title'],
    run: (e, r) => chain(e, r).setHeading({ level: 1 }).run(),
  },
  {
    id: 'heading2',
    label: 'Heading 2',
    keywords: ['h2', 'subtitle'],
    run: (e, r) => chain(e, r).setHeading({ level: 2 }).run(),
  },
  {
    id: 'heading3',
    label: 'Heading 3',
    keywords: ['h3'],
    run: (e, r) => chain(e, r).setHeading({ level: 3 }).run(),
  },
  {
    id: 'bullets',
    label: 'Bullet list',
    keywords: ['ul', 'unordered', 'points'],
    run: (e, r) => chain(e, r).toggleBulletList().run(),
  },
  {
    id: 'numbers',
    label: 'Numbered list',
    keywords: ['ol', 'ordered', '1.'],
    run: (e, r) => chain(e, r).toggleOrderedList().run(),
  },
  {
    id: 'checklist',
    label: 'Checklist',
    keywords: ['todo', 'task', 'checkbox'],
    run: (e, r) => chain(e, r).toggleTaskList().run(),
  },
  {
    id: 'table',
    label: 'Table',
    keywords: ['grid', 'columns'],
    run: (e, r) => chain(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: 'quote',
    label: 'Quote',
    keywords: ['blockquote', 'citation'],
    run: (e, r) => chain(e, r).setBlockquote().run(),
  },
  {
    id: 'code',
    label: 'Code',
    keywords: ['codeblock', 'script', 'python'],
    run: (e, r) => chain(e, r).setCodeBlock().run(),
  },
  {
    id: TEMPLATE_ITEM,
    label: 'Template',
    keywords: ['protocol', 'insert', 'snippet'],
    // Handled by the editor: it asks which template, then inserts it.
    run: (e, r) => chain(e, r).run(),
  },
  {
    id: PROPERTY_ITEM,
    label: 'Property',
    keywords: ['field', 'metadata', 'frontmatter', 'properties'],
    // Handled by the editor: it opens the page's properties.
    run: (e, r) => chain(e, r).run(),
  },
  {
    id: FILE_ITEM,
    label: 'File',
    keywords: ['attach', 'data', 'upload', 'link'],
    // Handled by the editor: it asks which file, then adds it here.
    run: (e, r) => chain(e, r).run(),
  },
  {
    id: 'divider',
    label: 'Divider',
    keywords: ['hr', 'rule', 'line', 'separator'],
    run: (e, r) => chain(e, r).setHorizontalRule().run(),
  },
];

/** Items whose name or keywords start with the typed words. */
export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (q === '') return SLASH_ITEMS;
  return SLASH_ITEMS.filter((item) =>
    [item.label, ...item.keywords].some(
      (word) =>
        word
          .toLowerCase()
          .split(/\s+/)
          .some((part) => part.startsWith(q)) || word.toLowerCase().startsWith(q),
    ),
  );
}

/** What the menu shows; `null` when it is closed. */
export interface SlashMenuState {
  items: SlashItem[];
  index: number;
  /** Where the `/` is on screen, to place the menu under it. */
  rect: DOMRect | null;
  choose: (index: number) => void;
}

export interface SlashOptions {
  onChange: (state: SlashMenuState | null) => void;
  /** Called with where to insert, when Template is chosen. */
  onTemplate: (pos: number) => void;
  /** Called with where it was chosen, for Property and File. */
  onAction: (id: typeof PROPERTY_ITEM | typeof FILE_ITEM, pos: number, editor: Editor) => void;
}

export const SlashCommands = Extension.create<SlashOptions>({
  name: 'slashCommands',

  addOptions() {
    return { onChange: () => undefined, onTemplate: () => undefined, onAction: () => undefined };
  },

  addProseMirrorPlugins() {
    const { onChange, onTemplate, onAction } = this.options;
    let current: { props: SuggestionProps<SlashItem, SlashItem>; index: number } | null = null;

    const emit = () => {
      const c = current;
      if (!c) {
        onChange(null);
        return;
      }
      onChange({
        items: c.props.items,
        index: c.index,
        rect: c.props.clientRect?.() ?? null,
        choose: (i) => {
          const item = c.props.items[i];
          if (item) c.props.command(item);
        },
      });
    };

    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props }) => {
          props.run(editor, range);
          if (props.id === TEMPLATE_ITEM) onTemplate(range.from);
          if (props.id === PROPERTY_ITEM || props.id === FILE_ITEM) {
            onAction(props.id, range.from, editor);
          }
        },
        render: () => ({
          onStart: (props) => {
            current = { props, index: 0 };
            emit();
          },
          onUpdate: (props) => {
            if (!current) return;
            current = {
              props,
              index: Math.min(current.index, Math.max(0, props.items.length - 1)),
            };
            emit();
          },
          onKeyDown: ({ event }) => {
            if (!current) return false;
            const count = current.props.items.length;
            switch (event.key) {
              case 'ArrowDown':
                current.index = (current.index + 1) % Math.max(1, count);
                emit();
                return true;
              case 'ArrowUp':
                current.index = (current.index - 1 + count) % Math.max(1, count);
                emit();
                return true;
              case 'Enter':
              case 'Tab': {
                const item = current.props.items[current.index];
                if (!item) return false;
                current.props.command(item);
                return true;
              }
              case 'Escape':
                current = null;
                onChange(null);
                return true;
              default:
                return false;
            }
          },
          onExit: () => {
            current = null;
            onChange(null);
          },
        }),
      }),
    ];
  },
});
