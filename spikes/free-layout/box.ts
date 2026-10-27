import { Extension, Node, mergeAttributes, type AnyExtension } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { Placeholder } from '@tiptap/extensions';
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import type * as Y from 'yjs';

/**
 * Free layout spike: one editor, whose document is a list of boxes, each
 * placed on the page by its x, y and width. Text, cut and paste, undo and
 * selection all stay those of one ProseMirror document; only how the boxes
 * are drawn changes. Not app code.
 */

export const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 120;

/** A free page holds only boxes; an empty page holds none. */
const FreeDoc = Node.create({
  name: 'doc',
  topNode: true,
  content: 'box*',
});

/** Where a box sits: left, top and width in pixels from the page's corner. */
export interface BoxPlace {
  x: number;
  y: number;
  w: number;
}

export const Box = Node.create({
  name: 'box',
  content: 'block+',
  isolating: true,
  defining: true,
  draggable: false,

  addAttributes() {
    const attr = (name: string, fallback: number) => ({
      default: fallback,
      parseHTML: (el: HTMLElement) => Number(el.dataset[name] ?? fallback),
      renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${name}`]: attrs[name] }),
    });
    return { x: attr('x', 0), y: attr('y', 0), w: attr('w', DEFAULT_WIDTH) };
  },

  parseHTML() {
    return [{ tag: 'div[data-box]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-box': '' }), 0];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div');
      dom.className = 'free-box';
      const handle = document.createElement('div');
      handle.className = 'box-handle';
      handle.contentEditable = 'false';
      handle.title = 'Drag to move';
      const resize = document.createElement('div');
      resize.className = 'box-resize';
      resize.contentEditable = 'false';
      resize.title = 'Drag to change the width';
      const content = document.createElement('div');
      content.className = 'box-content';
      dom.append(handle, content, resize);

      let current = node;
      const place = (p: BoxPlace) => {
        dom.style.left = `${String(p.x)}px`;
        dom.style.top = `${String(p.y)}px`;
        dom.style.width = `${String(p.w)}px`;
      };
      place(current.attrs as BoxPlace);

      /** Follows the pointer, then writes the new place in one undoable step. */
      const drag = (start: PointerEvent, change: (dx: number, dy: number) => BoxPlace) => {
        start.preventDefault();
        const target = start.currentTarget as HTMLElement;
        target.setPointerCapture(start.pointerId);
        dom.classList.add('moving');
        let next = current.attrs as BoxPlace;
        const onMove = (e: PointerEvent) => {
          next = change(e.clientX - start.clientX, e.clientY - start.clientY);
          place(next);
        };
        const onUp = () => {
          target.removeEventListener('pointermove', onMove);
          target.removeEventListener('pointerup', onUp);
          target.removeEventListener('pointercancel', onUp);
          dom.classList.remove('moving');
          const pos = getPos();
          if (typeof pos !== 'number') return;
          editor.view.dispatch(moveBox(editor.state.tr, pos, next));
          // Back to the text, so typing and Ctrl+Z carry on from here.
          editor.view.focus();
        };
        target.addEventListener('pointermove', onMove);
        target.addEventListener('pointerup', onUp);
        target.addEventListener('pointercancel', onUp);
      };

      handle.addEventListener('pointerdown', (e) => {
        const from = current.attrs as BoxPlace;
        drag(e, (dx, dy) => ({
          x: Math.max(0, Math.round(from.x + dx)),
          y: Math.max(0, Math.round(from.y + dy)),
          w: from.w,
        }));
      });
      resize.addEventListener('pointerdown', (e) => {
        const from = current.attrs as BoxPlace;
        drag(e, (dx) => ({ ...from, w: Math.max(MIN_WIDTH, Math.round(from.w + dx)) }));
      });

      return {
        dom,
        contentDOM: content,
        update(updated) {
          if (updated.type !== current.type) return false;
          current = updated;
          place(updated.attrs as BoxPlace);
          return true;
        },
        // The handles are ours, not the text's.
        stopEvent: (event) => event.target === handle || event.target === resize,
        ignoreMutation: (m) =>
          m.target === handle ||
          m.target === resize ||
          (m.type === 'attributes' && m.target === dom),
      };
    };
  },
});

/** Boxes in reading order: top to bottom, then left to right. */
function readingOrder(a: BoxPlace, b: BoxPlace): number {
  return a.y - b.y || a.x - b.x;
}

/** Where a box at `place` belongs in the document, so arrow keys follow reading order. */
function indexFor(doc: PMNode, place: BoxPlace, skip = -1): number {
  let index = 0;
  let i = 0;
  doc.forEach((child) => {
    if (i !== skip && readingOrder(child.attrs as BoxPlace, place) <= 0) index += 1;
    i += 1;
  });
  return index;
}

function posOfIndex(doc: PMNode, index: number): number {
  let pos = 0;
  for (let i = 0; i < index && i < doc.childCount; i += 1) pos += doc.child(i).nodeSize;
  return pos;
}

/** Moves the box at `pos` to `place`, and into its place in reading order. */
export function moveBox(tr: Transaction, pos: number, place: BoxPlace): Transaction {
  const node = tr.doc.nodeAt(pos);
  if (!node) return tr;
  let index = -1;
  tr.doc.forEach((_child, offset, i) => {
    if (offset === pos) index = i;
  });
  // Staying in the same place in reading order: only its place changes.
  if (indexFor(tr.doc, place, index) === index) {
    return tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...place });
  }
  const moved = node.type.create({ ...node.attrs, ...place }, node.content);
  const { selection } = tr;
  const inside = selection.from > pos && selection.to < pos + node.nodeSize;
  const offsetInBox = selection.from - pos;
  tr.delete(pos, pos + node.nodeSize);
  const target = posOfIndex(tr.doc, indexFor(tr.doc, place));
  tr.insert(target, moved);
  // Keep the cursor where it was in the text.
  if (inside) tr.setSelection(TextSelection.create(tr.doc, target + offsetInBox));
  return tr;
}

/** A new box at `place`, holding `content` or an empty paragraph, with the cursor in it. */
export function addBox(view: EditorView, place: BoxPlace, content?: Fragment): void {
  const { state } = view;
  const schema = state.schema;
  const paragraph = schema.nodes['paragraph'];
  const box = schema.nodes['box'];
  if (!paragraph || !box) return;
  const inner = content && content.size > 0 ? content : Fragment.from(paragraph.create());
  const node = box.create(place, inner);
  const at = posOfIndex(state.doc, indexFor(state.doc, place));
  const tr = state.tr.insert(at, node);
  tr.setSelection(TextSelection.near(tr.doc.resolve(at + node.nodeSize - 2), -1));
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

/** Blocks for a box from a pasted or dropped slice: inline content goes in a paragraph. */
function blocksOf(view: EditorView, slice: Slice): Fragment {
  const paragraph = view.state.schema.nodes['paragraph'];
  const first = slice.content.firstChild;
  if (first && first.type.name === 'box') {
    // Boxes copied whole: their contents.
    let blocks = Fragment.empty;
    slice.content.forEach((b) => {
      blocks = blocks.append(b.content);
    });
    return blocks;
  }
  if (first?.isInline && paragraph) return Fragment.from(paragraph.create(null, slice.content));
  return slice.content;
}

/** Whether the selection reaches into more than one box. */
export function spansBoxes(state: EditorState): boolean {
  const { $from, $to } = state.selection;
  return $from.index(0) !== $to.index(0);
}

/**
 * Deletes a selection that reaches across boxes, box by box, as OneNote
 * does: each box loses only the selected part and stays where it is;
 * boxes wholly selected go. Plain deleting would join what is left of the
 * first and last boxes into one.
 */
export function deleteAcross(tr: Transaction): Transaction {
  const { from, to } = tr.selection;
  const parts: { from: number; to: number }[] = [];
  tr.doc.forEach((box, pos) => {
    const start = pos + 1;
    const end = pos + box.nodeSize - 1;
    if (to <= start || from >= end) return;
    const whole = from <= start && to >= end;
    parts.push(
      whole
        ? { from: pos, to: pos + box.nodeSize }
        : { from: Math.max(from, start), to: Math.min(to, end) },
    );
  });
  // From the end, so earlier positions stay put.
  for (const part of parts.reverse()) tr.delete(part.from, part.to);
  const at = Math.min(tr.mapping.map(from, -1), tr.doc.content.size);
  return tr.setSelection(TextSelection.near(tr.doc.resolve(at)));
}

/** The point in the page under a pointer event. */
function pagePoint(view: EditorView, event: MouseEvent): { x: number; y: number } {
  const rect = view.dom.getBoundingClientRect();
  return { x: Math.round(event.clientX - rect.left), y: Math.round(event.clientY - rect.top) };
}

const cleanupKey = new PluginKey('free-layout-cleanup');

/**
 * Clicking empty page makes a box there; dropping on empty page makes a
 * box holding what was dropped; boxes left empty when the cursor leaves
 * them go away, as in OneNote.
 */
export const FreeLayout = Extension.create({
  name: 'freeLayout',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: cleanupKey,
        props: {
          handleDOMEvents: {
            cut: (view, event) => {
              if (!spansBoxes(view.state) || !event.clipboardData) return false;
              const { dom, text } = view.serializeForClipboard(view.state.selection.content());
              event.preventDefault();
              event.clipboardData.clearData();
              event.clipboardData.setData('text/html', dom.innerHTML);
              event.clipboardData.setData('text/plain', text);
              view.dispatch(deleteAcross(view.state.tr).setMeta('uiEvent', 'cut'));
              return true;
            },
            mousedown: (view, event) => {
              if (event.button !== 0 || event.target !== view.dom) return false;
              event.preventDefault();
              const p = pagePoint(view, event);
              // The cursor lands on the first line, where the click was.
              addBox(view, { x: Math.max(0, p.x - 8), y: Math.max(0, p.y - 14), w: DEFAULT_WIDTH });
              return true;
            },
          },
          handleKeyDown: (view, event) => {
            if ((event.key !== 'Backspace' && event.key !== 'Delete') || !spansBoxes(view.state)) {
              return false;
            }
            view.dispatch(deleteAcross(view.state.tr));
            return true;
          },
          handleTextInput: (view, _from, _to, text) => {
            if (!spansBoxes(view.state)) return false;
            view.dispatch(deleteAcross(view.state.tr).insertText(text));
            return true;
          },
          // Pasted boxes are not placed again: their text goes where the cursor is.
          handlePaste: (view, _event, slice) => {
            const hasBoxes = slice.content.firstChild?.type.name === 'box';
            if (!hasBoxes && !spansBoxes(view.state)) return false;
            const tr = spansBoxes(view.state) ? deleteAcross(view.state.tr) : view.state.tr;
            const content = hasBoxes ? new Slice(blocksOf(view, slice), 0, 0) : slice;
            view.dispatch(tr.replaceSelection(content).scrollIntoView());
            return true;
          },
          handleDrop: (view, event, slice, moved) => {
            if (event.target !== view.dom) return false;
            event.preventDefault();
            const p = pagePoint(view, event);
            const content = blocksOf(view, slice);
            if (moved) {
              const { state } = view;
              view.dispatch(
                spansBoxes(state) ? deleteAcross(state.tr) : state.tr.deleteSelection(),
              );
            }
            addBox(view, { x: p.x, y: p.y, w: DEFAULT_WIDTH }, content);
            return true;
          },
        },
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((t) => t.docChanged || t.selectionSet)) return null;
          const { from } = state.selection;
          const empty: { pos: number; size: number }[] = [];
          state.doc.forEach((box, pos) => {
            const blank =
              box.childCount === 1 &&
              box.textContent === '' &&
              box.firstChild?.type.name === 'paragraph';
            const holdsCursor = from > pos && from < pos + box.nodeSize;
            if (blank && !holdsCursor) empty.push({ pos, size: box.nodeSize });
          });
          if (empty.length === 0) return null;
          const tr = state.tr;
          for (const e of empty.reverse()) tr.delete(e.pos, e.pos + e.size);
          return tr.setMeta('addToHistory', false);
        },
      }),
    ];
  },
});

/** The spike's editor: the page editor's blocks, inside boxes, on a Yjs document. */
export function freeExtensions(ydoc: Y.Doc): AnyExtension[] {
  return [
    StarterKit.configure({
      document: false,
      undoRedo: false,
      underline: false,
      link: { openOnClick: false, autolink: true, linkOnPaste: true },
    }),
    FreeDoc,
    Box,
    FreeLayout,
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder: 'Type here', includeChildren: true }),
    Collaboration.configure({ document: ydoc, field: 'default' }),
  ];
}
