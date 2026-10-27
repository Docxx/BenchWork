import type { Editor } from '@tiptap/react';
import {
  Bold,
  CalendarDays,
  Clock,
  Code,
  Highlighter,
  ImagePlus,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  SquareCode,
  StickyNote,
  Strikethrough,
  Table,
  TextCursorInput,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import {
  addBox,
  boxAtCursor,
  BOX_COLOURS,
  ensureBox,
  freeSpot,
  insertImages,
  type BoxColour,
} from './box';

/**
 * A ribbon across the top of the page: Home for text,
 * Insert for things to add. Spike only: the app's version will live in the
 * page's top bar and can be hidden.
 */

const ICON = { size: 17, strokeWidth: 1.8, 'aria-hidden': true } as const;

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

function Group({ children }: { children: ReactNode }) {
  return <div className="tool-group">{children}</div>;
}

const STYLES = [
  { value: 'p', label: 'Normal text' },
  { value: '1', label: 'Heading 1' },
  { value: '2', label: 'Heading 2' },
  { value: '3', label: 'Heading 3' },
] as const;

const COLOUR_NAMES: Record<BoxColour, string> = {
  yellow: 'Yellow',
  pink: 'Pink',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
};

function today(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function now(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function Toolbar({ editor, free }: { editor: Editor; free: boolean }) {
  const [tab, setTab] = useState<'home' | 'insert'>('home');
  const picture = useRef<HTMLInputElement>(null);
  const chain = () => editor.chain().focus();
  const is = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs);
  const box = boxAtCursor(editor.state);
  const boxColour = (box?.node.attrs['colour'] as BoxColour | null | undefined) ?? null;

  const style = is('heading', { level: 1 })
    ? '1'
    : is('heading', { level: 2 })
      ? '2'
      : is('heading', { level: 3 })
        ? '3'
        : 'p';

  const setBoxColour = (colour: BoxColour | null) => {
    if (!box) return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(box.pos, undefined, { ...box.node.attrs, colour }),
    );
    editor.view.focus();
  };

  /** Runs `then` with the cursor in a box, making one on an empty page. */
  const inBox = (then: () => void) => {
    ensureBox(editor.view);
    then();
  };

  return (
    <div className="ribbon">
      <div className="ribbon-tabs" role="tablist" aria-label="Toolbar">
        {(['home', 'insert'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
            }}
          >
            {t === 'home' ? 'Home' : 'Insert'}
          </button>
        ))}
      </div>

      {tab === 'home' ? (
        <div className="ribbon-tools" role="toolbar" aria-label="Home">
          <Group>
            <Tool icon={Undo2} label="Undo (Ctrl+Z)" onClick={() => chain().undo().run()} />
            <Tool icon={Redo2} label="Redo (Ctrl+Y)" onClick={() => chain().redo().run()} />
          </Group>
          <Group>
            <select
              aria-label="Text style"
              value={style}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'p') chain().setParagraph().run();
                else
                  chain()
                    .setHeading({ level: Number(v) as 1 | 2 | 3 })
                    .run();
              }}
            >
              {STYLES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Group>
          <Group>
            <Tool
              icon={Bold}
              label="Bold (Ctrl+B)"
              active={is('bold')}
              onClick={() => chain().toggleBold().run()}
            />
            <Tool
              icon={Italic}
              label="Italic (Ctrl+I)"
              active={is('italic')}
              onClick={() => chain().toggleItalic().run()}
            />
            <Tool
              icon={Underline}
              label="Underline (Ctrl+U)"
              active={is('underline')}
              onClick={() => chain().toggleUnderline().run()}
            />
            <Tool
              icon={Strikethrough}
              label="Strikethrough"
              active={is('strike')}
              onClick={() => chain().toggleStrike().run()}
            />
            <Tool
              icon={Highlighter}
              label="Highlight (Ctrl+Shift+H)"
              active={is('highlight')}
              onClick={() => chain().toggleMark('highlight').run()}
            />
            <Tool
              icon={Code}
              label="Code"
              active={is('code')}
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
              active={is('bulletList')}
              onClick={() => chain().toggleBulletList().run()}
            />
            <Tool
              icon={ListOrdered}
              label="Numbering"
              active={is('orderedList')}
              onClick={() => chain().toggleOrderedList().run()}
            />
            <Tool
              icon={ListChecks}
              label="To-do list"
              active={is('taskList')}
              onClick={() => chain().toggleTaskList().run()}
            />
            <Tool
              icon={Quote}
              label="Quote"
              active={is('blockquote')}
              onClick={() => chain().toggleBlockquote().run()}
            />
          </Group>
          {free && (
            <Group>
              <span className="tool-label">Box colour</span>
              <button
                type="button"
                className="colour-chip none"
                title="No colour"
                aria-label="No colour"
                aria-pressed={box !== null && boxColour === null}
                disabled={box === null}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => {
                  setBoxColour(null);
                }}
              />
              {BOX_COLOURS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="colour-chip"
                  data-colour={c}
                  title={COLOUR_NAMES[c]}
                  aria-label={COLOUR_NAMES[c]}
                  aria-pressed={boxColour === c}
                  disabled={box === null}
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  onClick={() => {
                    setBoxColour(c);
                  }}
                />
              ))}
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
              icon={Table}
              label="Table"
              onClick={() => {
                inBox(() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run());
              }}
            />
            <Tool
              icon={ImagePlus}
              label="Picture"
              onClick={() => {
                picture.current?.click();
              }}
            />
            <input
              ref={picture}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                void insertImages(editor.view, files);
              }}
            />
            <Tool
              icon={Link}
              label="Link"
              onClick={() => {
                const url = window.prompt('Link to', 'https://');
                if (url) inBox(() => chain().extendMarkRange('link').setLink({ href: url }).run());
              }}
            />
          </Group>
          <Group>
            <Tool
              icon={ListChecks}
              label="To-do list"
              onClick={() => {
                inBox(() => chain().toggleTaskList().run());
              }}
            />
            <Tool
              icon={SquareCode}
              label="Code block"
              onClick={() => {
                inBox(() => chain().toggleCodeBlock().run());
              }}
            />
            <Tool
              icon={Minus}
              label="Divider"
              onClick={() => {
                inBox(() => chain().setHorizontalRule().run());
              }}
            />
          </Group>
          <Group>
            <Tool
              icon={CalendarDays}
              label="Today's date"
              onClick={() => {
                inBox(() => chain().insertContent(today()).run());
              }}
            />
            <Tool
              icon={Clock}
              label="Time now"
              onClick={() => {
                inBox(() => chain().insertContent(now()).run());
              }}
            />
          </Group>
        </div>
      )}
    </div>
  );
}
