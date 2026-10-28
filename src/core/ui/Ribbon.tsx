import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  Bold,
  BookMarked,
  CalendarDays,
  ChevronDown,
  Clock,
  Code,
  FileStack,
  Highlighter,
  Italic,
  Link,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Paperclip,
  PenLine,
  Quote,
  Redo2,
  RemoveFormatting,
  SquareCode,
  StickyNote,
  Strikethrough,
  Table,
  TextCursorInput,
  Trash2,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { addBox, boxAtCursor, deleteBox, freeSpot, setBoxColour } from '../editor/freeLayout';
import { drawAtCursor } from '../editor/inkInput';
import { BOX_COLOURS, type BoxColour } from '../editor/markdown/model';
import type { PageEditorHandle } from '../state/pageSlice';
import { useApp } from './AppStoreContext';
import { PenTools } from './PenTools';

/**
 * The toolbar above a page: Home for text and lists, Insert for things to
 * add. Every tool also has a keyboard shortcut or a / menu item, so the
 * toolbar can be hidden in Settings > Appearance.
 */

const ICON = { size: 17, strokeWidth: 1.8, 'aria-hidden': true } as const;

const COLOUR_NAMES: Record<BoxColour, string> = {
  yellow: 'Yellow',
  pink: 'Pink',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
};

type RibbonTab = 'home' | 'insert' | 'draw';
const TAB_NAMES: Record<RibbonTab, string> = { home: 'Home', insert: 'Insert', draw: 'Draw' };

type StyleId = 'p' | '1' | '2' | '3' | 'quote' | 'code';

/** Text styles, each shown in the menu as it looks on the page. */
const STYLES: { value: StyleId; label: string }[] = [
  { value: 'p', label: 'Normal text' },
  { value: '1', label: 'Heading 1' },
  { value: '2', label: 'Heading 2' },
  { value: '3', label: 'Heading 3' },
  { value: 'quote', label: 'Quote' },
  { value: 'code', label: 'Code block' },
];

function setStyle(editor: Editor, style: StyleId): void {
  const chain = editor.chain().focus();
  // Out of a quote first, so a quoted heading becomes a plain one.
  if (style !== 'quote' && editor.isActive('blockquote')) chain.lift('blockquote');
  if (style === 'p') chain.setParagraph();
  else if (style === 'quote') chain.setParagraph().setBlockquote();
  else if (style === 'code') chain.setCodeBlock();
  else chain.setHeading({ level: Number(style) as 1 | 2 | 3 });
  chain.run();
}

/** A drop-down of text styles, each previewed in its own look. */
function StyleMenu({ editor, current }: { editor: Editor; current: StyleId }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = STYLES.find((st) => st.value === current)?.label ?? 'Normal text';

  useEffect(() => {
    if (!open) return;
    const list = ref.current?.querySelector<HTMLElement>('[role="menu"]');
    (
      list?.querySelector<HTMLElement>('[aria-checked="true"]') ??
      list?.querySelector<HTMLElement>('[role="menuitemradio"]')
    )?.focus();
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('mousedown', close);
    };
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false);
      if (e.key === 'Escape') editor.commands.focus();
      if (e.key === 'Tab') return;
    } else if (e.key === 'ArrowDown') {
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      items[(i - 1 + items.length) % items.length]?.focus();
    } else {
      return;
    }
    e.preventDefault();
  };

  return (
    <div className="style-menu" ref={ref} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="style-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Text style: ${label}`}
        title="Text style"
        onMouseDown={(e) => {
          e.preventDefault();
        }}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        {label}
        <ChevronDown size={14} strokeWidth={1.8} aria-hidden />
      </button>
      {open && (
        <div className="menu style-list" role="menu" aria-label="Text styles">
          {STYLES.map((st) => (
            <button
              key={st.value}
              type="button"
              role="menuitemradio"
              aria-checked={st.value === current}
              className={`menu-item style-preview style-${st.value}`}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => {
                setOpen(false);
                setStyle(editor, st.value);
              }}
            >
              {st.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Tool({
  icon: Icon,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="tool"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keeps the selection in the page while a tool is pressed.
      onMouseDown={(e) => {
        e.preventDefault();
      }}
      onClick={onClick}
    >
      <Icon {...ICON} />
    </button>
  );
}

/** The style of the block the cursor is in. */
function styleAt(e: Editor): StyleId {
  for (const level of [1, 2, 3] as const) {
    if (e.isActive('heading', { level })) return String(level) as StyleId;
  }
  if (e.isActive('codeBlock')) return 'code';
  if (e.isActive('blockquote')) return 'quote';
  return 'p';
}

function Group({ children }: { children: ReactNode }) {
  return <div className="tool-group">{children}</div>;
}

function today(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function timeNow(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function Ribbon({ handle, free }: { handle: PageEditorHandle; free: boolean }) {
  const { editor } = handle;
  const [chosenTab, setTab] = useState<RibbonTab | null>(null);
  // The Draw tab shows once a pen is seen, and opens by itself then.
  const penSeen = useApp((s) => s.penSeen);
  const inkShown = useApp((s) => s.inkShown);
  const newInkTarget = useApp((s) => s.newInkTarget);
  const tabs: RibbonTab[] = penSeen || inkShown ? ['home', 'insert', 'draw'] : ['home', 'insert'];
  const tab = chosenTab ?? (penSeen ? 'draw' : 'home');
  const askText = useApp((s) => s.askText);
  const canCite = useApp((s) => s.citationProviders.length > 0);

  // What the toolbar shows as on, updated as the cursor moves.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      code: e.isActive('code'),
      bullets: e.isActive('bulletList'),
      numbers: e.isActive('orderedList'),
      tasks: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      style: styleAt(e),
      inBox: boxAtCursor(e.state) !== null,
      colour: (boxAtCursor(e.state)?.node.attrs['colour'] as BoxColour | null | undefined) ?? null,
    }),
  });

  const chain = () => editor.chain().focus();

  return (
    <div className="ribbon">
      <div className="ribbon-tabs" role="tablist" aria-label="Toolbar">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              setTab(t);
            }}
          >
            {TAB_NAMES[t]}
          </button>
        ))}
      </div>

      {tab === 'draw' ? (
        <div className="ribbon-tools" role="toolbar" aria-label="Draw">
          <PenTools />
        </div>
      ) : tab === 'home' ? (
        <div className="ribbon-tools" role="toolbar" aria-label="Home">
          <Group>
            <Tool icon={Undo2} label="Undo (Ctrl+Z)" onClick={() => chain().undo().run()} />
            <Tool icon={Redo2} label="Redo (Ctrl+Y)" onClick={() => chain().redo().run()} />
          </Group>
          <Group>
            <StyleMenu editor={editor} current={state.style} />
          </Group>
          <Group>
            <Tool
              icon={Bold}
              label="Bold (Ctrl+B)"
              active={state.bold}
              onClick={() => chain().toggleBold().run()}
            />
            <Tool
              icon={Italic}
              label="Italic (Ctrl+I)"
              active={state.italic}
              onClick={() => chain().toggleItalic().run()}
            />
            <Tool
              icon={Underline}
              label="Underline (Ctrl+U)"
              active={state.underline}
              onClick={() => chain().toggleUnderline().run()}
            />
            <Tool
              icon={Strikethrough}
              label="Strikethrough"
              active={state.strike}
              onClick={() => chain().toggleStrike().run()}
            />
            <Tool
              icon={Highlighter}
              label="Highlight (Ctrl+Shift+H)"
              active={state.highlight}
              onClick={() => chain().toggleMark('highlight').run()}
            />
            <Tool
              icon={Code}
              label="Code"
              active={state.code}
              onClick={() => chain().toggleCode().run()}
            />
            <Tool
              icon={RemoveFormatting}
              label="Clear formatting"
              onClick={() => chain().unsetAllMarks().setParagraph().run()}
            />
          </Group>
          <Group>
            <Tool
              icon={List}
              label="Bullets"
              active={state.bullets}
              onClick={() => chain().toggleBulletList().run()}
            />
            <Tool
              icon={ListOrdered}
              label="Numbering"
              active={state.numbers}
              onClick={() => chain().toggleOrderedList().run()}
            />
            <Tool
              icon={ListChecks}
              label="Checklist"
              active={state.tasks}
              onClick={() => chain().toggleTaskList().run()}
            />
            <Tool
              icon={Quote}
              label="Quote"
              active={state.quote}
              onClick={() => chain().toggleBlockquote().run()}
            />
          </Group>
          {free && (
            <Group>
              <span className="tool-label">Box colour</span>
              {([null, ...BOX_COLOURS] as const).map((c) => (
                <button
                  key={c ?? 'none'}
                  type="button"
                  className={c === null ? 'colour-chip none' : 'colour-chip'}
                  data-colour={c ?? undefined}
                  title={c === null ? 'No colour' : COLOUR_NAMES[c]}
                  aria-label={c === null ? 'No colour' : COLOUR_NAMES[c]}
                  aria-pressed={state.inBox && state.colour === c}
                  disabled={!state.inBox}
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  onClick={() => {
                    setBoxColour(editor, c);
                  }}
                />
              ))}
              <Tool
                icon={Trash2}
                label="Delete box"
                disabled={!state.inBox}
                onClick={() => {
                  const box = boxAtCursor(editor.state);
                  if (!box) return;
                  editor.view.dispatch(deleteBox(editor.state.tr, box.pos));
                  editor.view.focus();
                }}
              />
            </Group>
          )}
        </div>
      ) : (
        <div className="ribbon-tools" role="toolbar" aria-label="Insert">
          {free && (
            <Group>
              <Tool
                icon={TextCursorInput}
                label="Text box"
                onClick={() => {
                  addBox(editor.view, freeSpot(editor.view));
                }}
              />
              <Tool
                icon={StickyNote}
                label="Sticky note"
                onClick={() => {
                  addBox(editor.view, {
                    ...freeSpot(editor.view),
                    w: 240,
                    h: 180,
                    colour: 'yellow',
                  });
                }}
              />
            </Group>
          )}
          <Group>
            <Tool
              icon={PenLine}
              label="Drawing"
              onClick={() => {
                drawAtCursor(editor, newInkTarget());
              }}
            />
            <Tool
              icon={Table}
              label="Table"
              onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            />
            <Tool
              icon={Paperclip}
              label="Picture or file"
              onClick={() => {
                handle.addFilesAt(editor.state.selection.from);
              }}
            />
            <Tool
              icon={Link2}
              label="Link to a page"
              onClick={() => chain().insertContent('[[').run()}
            />
            {canCite && (
              <Tool
                icon={BookMarked}
                label="Citation"
                onClick={() => chain().insertContent('[@').run()}
              />
            )}
            <Tool
              icon={Link}
              label="Web link"
              onClick={() => {
                const { from, to } = editor.state.selection;
                void askText({ title: 'Web link', label: 'Address', initial: 'https://' }).then(
                  (url) => {
                    if (url === null || url.trim() === '' || url.trim() === 'https://') return;
                    const href = url.trim();
                    const c = editor.chain().focus().setTextSelection({ from, to });
                    if (from === to) {
                      c.insertContent({
                        type: 'text',
                        text: href,
                        marks: [{ type: 'link', attrs: { href } }],
                      }).run();
                    } else {
                      c.setLink({ href }).run();
                    }
                  },
                );
              }}
            />
          </Group>
          <Group>
            <Tool
              icon={SquareCode}
              label="Code block"
              onClick={() => chain().toggleCodeBlock().run()}
            />
            <Tool icon={Minus} label="Divider" onClick={() => chain().setHorizontalRule().run()} />
          </Group>
          <Group>
            <Tool
              icon={CalendarDays}
              label="Today's date"
              onClick={() => chain().insertContent(today()).run()}
            />
            <Tool
              icon={Clock}
              label="Time now"
              onClick={() => chain().insertContent(timeNow()).run()}
            />
            <Tool
              icon={FileStack}
              label="Template"
              onClick={() => {
                handle.chooseTemplate(editor.state.selection.from);
              }}
            />
          </Group>
        </div>
      )}
    </div>
  );
}
