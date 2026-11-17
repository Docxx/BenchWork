import { Placeholder, UndoRedo } from '@tiptap/extensions';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Nodes, Parent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { Fragment, useMemo, useRef, type ReactNode } from 'react';
import { baseExtensions } from '../editor/extensions';
import { parseBody, serialiseBody } from '../editor/markdown/markdown';
import type { PMNode } from '../editor/markdown/model';

/**
 * Short formatted notes, such as the text on a canvas card: bold, italic,
 * links and lists, kept as Markdown but never shown as Markdown.
 *
 * `NoteText` draws the note without an editor, so a board of a thousand
 * cards stays quick; `NoteTextEditor` edits one note at a time with the
 * page editor's own blocks and marks, and gives back Markdown.
 */

const NO_SOURCE = { leading: '', trailing: '' };

/** Plain text, line breaks and all, as Markdown that shows exactly those words. */
export function plainTextToMarkdown(text: string): string {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n[ \t]*\n/)
    .filter((p) => p.trim() !== '');
  const doc: PMNode = {
    type: 'doc',
    content: paragraphs.map((p) => ({
      type: 'paragraph',
      content: p.split('\n').flatMap((line, i): PMNode[] => {
        const words: PMNode[] = line === '' ? [] : [{ type: 'text', text: line }];
        return i === 0 ? words : [{ type: 'hardBreak' }, ...words];
      }),
    })),
  };
  return serialiseBody(doc, NO_SOURCE).trimEnd();
}

function parse(markdown: string): Nodes {
  return fromMarkdown(markdown.replace(/\r\n/g, '\n'), {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
}

/** The words of a Markdown note, without its formatting. */
export function noteWords(markdown: string): string {
  const words = (node: Nodes): string => {
    if ('value' in node && typeof node.value === 'string') return node.value;
    if (node.type === 'break') return '\n';
    if (!('children' in node)) return '';
    const block = ['paragraph', 'heading', 'listItem', 'blockquote', 'tableRow'].includes(
      node.type,
    );
    const inner = (node as Parent).children.map((c) => words(c as Nodes)).join('');
    return block ? `${inner}\n` : inner;
  };
  return words(parse(markdown)).trim();
}

/** Only web and vault links; anything else is shown as words. */
const SAFE_LINK = /^(https?:\/\/|mailto:|[^:]*$)/i;

function render(node: Nodes, key: number, open: (url: string) => void): ReactNode {
  const kids = () =>
    'children' in node
      ? (node as Parent).children.map((c, i) => render(c as Nodes, i, open))
      : null;
  switch (node.type) {
    case 'root':
      return <Fragment key={key}>{kids()}</Fragment>;
    case 'paragraph':
      return <p key={key}>{kids()}</p>;
    case 'heading':
      return (
        <p key={key} className="note-heading">
          <strong>{kids()}</strong>
        </p>
      );
    case 'list':
      return node.ordered === true ? (
        <ol key={key} start={node.start ?? undefined}>
          {kids()}
        </ol>
      ) : (
        <ul key={key}>{kids()}</ul>
      );
    case 'listItem':
      return (
        <li key={key}>
          {typeof node.checked === 'boolean' && (
            <input type="checkbox" checked={node.checked} readOnly aria-hidden tabIndex={-1} />
          )}
          {/* A tight list's paragraphs are just its words. */}
          {node.spread === true
            ? kids()
            : node.children.map((c, i) =>
                c.type === 'paragraph' ? (
                  <Fragment key={i}>
                    {c.children.map((g, j) => render(g as Nodes, j, open))}
                  </Fragment>
                ) : (
                  render(c, i, open)
                ),
              )}
        </li>
      );
    case 'blockquote':
      return <blockquote key={key}>{kids()}</blockquote>;
    case 'code':
      return (
        <pre key={key}>
          <code>{node.value}</code>
        </pre>
      );
    case 'thematicBreak':
      return <hr key={key} />;
    case 'strong':
      return <strong key={key}>{kids()}</strong>;
    case 'emphasis':
      return <em key={key}>{kids()}</em>;
    case 'delete':
      return <s key={key}>{kids()}</s>;
    case 'inlineCode':
      return <code key={key}>{node.value}</code>;
    case 'break':
      return <br key={key} />;
    case 'link':
      if (!SAFE_LINK.test(node.url)) return <Fragment key={key}>{kids()}</Fragment>;
      return (
        <a
          key={key}
          href={node.url}
          title={node.url}
          className="nodrag"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            open(node.url);
          }}
        >
          {kids()}
        </a>
      );
    case 'text':
    case 'html':
      return <Fragment key={key}>{node.value}</Fragment>;
    case 'image':
      return <Fragment key={key}>{node.alt ?? ''}</Fragment>;
    default:
      // Tables and anything rarer: their words, so nothing is lost.
      return 'children' in node ? <p key={key}>{wordsOf(node)}</p> : null;
  }
}

/** A node's words, run together. */
function wordsOf(node: Nodes): string {
  const words = (n: Nodes): string =>
    'value' in n && typeof n.value === 'string'
      ? n.value
      : 'children' in n
        ? (n as Parent).children.map((c) => words(c as Nodes)).join(' ')
        : '';
  return words(node);
}

/** A Markdown note, formatted. Links go to `onOpenLink` rather than leaving the app. */
export function NoteText({
  markdown,
  className,
  onOpenLink,
}: {
  markdown: string;
  className?: string;
  onOpenLink: (url: string) => void;
}) {
  const tree = useMemo(() => parse(markdown), [markdown]);
  return (
    <div className={['note-text', className].filter(Boolean).join(' ')}>
      {render(tree, 0, onOpenLink)}
    </div>
  );
}

/**
 * Edits a Markdown note in place. Bold, italic and lists work as on a page
 * (keys, or typing `- ` for a list); links are made by pasting a web address.
 * `onDone` gets the Markdown when the note loses focus or Escape is pressed.
 */
export function NoteTextEditor({
  markdown,
  label,
  placeholder = 'Write here',
  onDone,
}: {
  markdown: string;
  label: string;
  placeholder?: string;
  onDone: (markdown: string) => void;
}) {
  const loaded = useMemo(() => parseBody(markdown), [markdown]);
  const finished = useRef(false);
  const finish = (doc: PMNode) => {
    if (finished.current) return;
    finished.current = true;
    onDone(serialiseBody(doc, loaded.source).trimEnd());
  };
  const editor = useEditor({
    extensions: [
      ...baseExtensions().filter((e) => e.name !== 'placeholder'),
      Placeholder.configure({ placeholder }),
      UndoRedo,
    ],
    content: loaded.doc,
    autofocus: 'end',
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': label,
        'aria-multiline': 'true',
        class: 'note-editor',
      },
      handleKeyDown: (view, event) => {
        if (event.key !== 'Escape') return false;
        view.dom.blur();
        return true;
      },
    },
    onBlur: ({ editor: e }) => {
      finish(e.getJSON() as PMNode);
    },
  });
  return <EditorContent editor={editor} className="note-text editing nodrag nowheel" />;
}
