import { Extension, Mark, Node, mergeAttributes, type AnyExtension } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import Image from '@tiptap/extension-image';
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
 * placed on the page by its x, y, width and (optionally) height. Text,
 * cut and paste, undo and selection all stay those of one ProseMirror
 * document; only how the boxes are drawn changes. Not app code.
 */

export const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 120;
const MIN_HEIGHT = 40;
/** How far the pointer may wander before a press on empty page counts as a drag. */
const CLICK_SLOP = 5;

/** Colours a box can have; any colour makes it a sticky note. */
export const BOX_COLOURS = ['yellow', 'pink', 'green', 'blue', 'purple'] as const;
export type BoxColour = (typeof BOX_COLOURS)[number];

/** A free page holds only boxes; an empty page holds none. */
const FreeDoc = Node.create({
  name: 'doc',
  topNode: true,
  content: 'box*',
});

/**
 * Where a box sits: left, top, width and height in pixels from the page's
 * corner. A height of 0 means as tall as its text.
 */
export interface BoxPlace {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** ==highlighted== text, as Obsidian writes it. */
export const Highlight = Mark.create({
  name: 'highlight',
  parseHTML() {
    return [{ tag: 'mark' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['mark', HTMLAttributes, 0];
  },
  addKeyboardShortcuts() {
    return { 'Mod-Shift-h': () => this.editor.commands.toggleMark(this.name) };
  },
});

/** The nearest ancestor that scrolls, for scrolling while dragging. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if (overflowY === 'auto' || overflowY === 'scroll') return p;
  }
  return null;
}

/** Scrolls when the pointer is near the top or bottom while dragging. */
function nudgeScroll(scroller: HTMLElement | null, clientY: number): void {
  if (!scroller) return;
  const rect = scroller.getBoundingClientRect();
  if (clientY > rect.bottom - 48) scroller.scrollTop += 18;
  else if (clientY < rect.top + 48) scroller.scrollTop -= 18;
}

export const Box = Node.create({
  name: 'box',
  content: 'block+',
  isolating: true,
  defining: true,
  draggable: false,

  addAttributes() {
    const number = (name: string, fallback: number) => ({
      default: fallback,
      parseHTML: (el: HTMLElement) => Number(el.dataset[name] ?? fallback),
      renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${name}`]: attrs[name] }),
    });
    return {
      x: number('x', 0),
      y: number('y', 0),
      w: number('w', DEFAULT_WIDTH),
      h: number('h', 0),
      colour: {
        default: null,
        parseHTML: (el: HTMLElement) => el.dataset['colour'] ?? null,
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs['colour'] ? { 'data-colour': attrs['colour'] } : {},
      },
    };
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
      const part = (className: string, title: string) => {
        const el = document.createElement('div');
        el.className = className;
        el.contentEditable = 'false';
        el.title = title;
        return el;
      };
      const handle = part('box-handle', 'Drag to move');
      const right = part('box-resize right', 'Drag to change the width');
      const bottom = part('box-resize bottom', 'Drag to change the height');
      const corner = part('box-resize corner', 'Drag to change the size');
      const content = document.createElement('div');
      content.className = 'box-content';
      dom.append(handle, content, right, bottom, corner);
      const handles: HTMLElement[] = [handle, right, bottom, corner];

      let current = node;
      const show = (n: PMNode) => {
        const p = n.attrs as BoxPlace;
        dom.style.left = `${String(p.x)}px`;
        dom.style.top = `${String(p.y)}px`;
        dom.style.width = `${String(p.w)}px`;
        dom.style.minHeight = p.h > 0 ? `${String(p.h)}px` : '';
        const colour = n.attrs['colour'] as string | null;
        dom.dataset['colour'] = colour ?? '';
        dom.classList.toggle('sticky', colour !== null);
      };
      show(current);

      /** Follows the pointer, scrolling near the edges, then saves the new place in one step. */
      const drag = (
        start: PointerEvent,
        change: (from: BoxPlace, dx: number, dy: number) => Partial<BoxPlace>,
      ) => {
        start.preventDefault();
        const target = start.currentTarget as HTMLElement;
        target.setPointerCapture(start.pointerId);
        dom.classList.add('moving');
        const scroller = scrollParent(dom);
        const startScroll = scroller?.scrollTop ?? 0;
        const from = current.attrs as BoxPlace;
        let next = from;
        const onMove = (e: PointerEvent) => {
          nudgeScroll(scroller, e.clientY);
          const scrolled = (scroller?.scrollTop ?? 0) - startScroll;
          next = {
            ...from,
            ...change(from, e.clientX - start.clientX, e.clientY - start.clientY + scrolled),
          };
          dom.style.left = `${String(next.x)}px`;
          dom.style.top = `${String(next.y)}px`;
          dom.style.width = `${String(next.w)}px`;
          dom.style.minHeight = next.h > 0 ? `${String(next.h)}px` : '';
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

      /** The box's height now, as drawn, for resizing from it. */
      const drawnHeight = () => Math.round(dom.getBoundingClientRect().height);
      const width = (f: BoxPlace, dx: number) => Math.max(MIN_WIDTH, Math.round(f.w + dx));
      const height = (base: number, dy: number) => Math.max(MIN_HEIGHT, Math.round(base + dy));

      handle.addEventListener('pointerdown', (e) => {
        drag(e, (f, dx, dy) => ({
          x: Math.max(0, Math.round(f.x + dx)),
          y: Math.max(0, Math.round(f.y + dy)),
        }));
      });
      right.addEventListener('pointerdown', (e) => {
        drag(e, (f, dx) => ({ w: width(f, dx) }));
      });
      bottom.addEventListener('pointerdown', (e) => {
        const base = drawnHeight();
        drag(e, (_f, _dx, dy) => ({ h: height(base, dy) }));
      });
      corner.addEventListener('pointerdown', (e) => {
        const base = drawnHeight();
        drag(e, (f, dx, dy) => ({ w: width(f, dx), h: height(base, dy) }));
      });

      return {
        dom,
        contentDOM: content,
        update(updated) {
          if (updated.type !== current.type) return false;
          current = updated;
          show(updated);
          return true;
        },
        // The handles are ours, not the text's.
        stopEvent: (event) => handles.includes(event.target as HTMLElement),
        ignoreMutation: (m) =>
          handles.includes(m.target as HTMLElement) ||
          (m.type === 'attributes' && m.target === dom),
      };
    };
  },
});

/** Boxes in reading order: top to bottom, then left to right. */
function readingOrder(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return a.y - b.y || a.x - b.x;
}

/** Where a box at `place` belongs in the document, so arrow keys follow reading order. */
function indexFor(doc: PMNode, place: { x: number; y: number }, skip = -1): number {
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

/** Moves or resizes the box at `pos`, keeping it in its place in reading order. */
export function moveBox(tr: Transaction, pos: number, place: Partial<BoxPlace>): Transaction {
  const node = tr.doc.nodeAt(pos);
  if (!node) return tr;
  const attrs = { ...node.attrs, ...place } as BoxPlace;
  let index = -1;
  tr.doc.forEach((_child, offset, i) => {
    if (offset === pos) index = i;
  });
  // Staying in the same place in reading order: only its attributes change.
  if (indexFor(tr.doc, attrs, index) === index) return tr.setNodeMarkup(pos, undefined, attrs);
  const moved = node.type.create(attrs, node.content);
  const { selection } = tr;
  const inside = selection.from > pos && selection.to < pos + node.nodeSize;
  const offsetInBox = selection.from - pos;
  tr.delete(pos, pos + node.nodeSize);
  const target = posOfIndex(tr.doc, indexFor(tr.doc, attrs));
  tr.insert(target, moved);
  // Keep the cursor where it was in the text.
  if (inside) tr.setSelection(TextSelection.create(tr.doc, target + offsetInBox));
  return tr;
}

export interface NewBox {
  x: number;
  y: number;
  w?: number;
  h?: number;
  colour?: BoxColour | null;
}

/** A new box, holding `content` or an empty paragraph, with the cursor at its end. */
export function addBox(view: EditorView, place: NewBox, content?: Fragment): void {
  const { state } = view;
  const paragraph = state.schema.nodes['paragraph'];
  const box = state.schema.nodes['box'];
  if (!paragraph || !box) return;
  const inner = content && content.size > 0 ? content : Fragment.from(paragraph.create());
  const attrs = { w: DEFAULT_WIDTH, h: 0, colour: null, ...place };
  const node = box.create(attrs, inner);
  const at = posOfIndex(state.doc, indexFor(state.doc, attrs));
  const tr = state.tr.insert(at, node);
  tr.setSelection(TextSelection.near(tr.doc.resolve(at + node.nodeSize - 2), -1));
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

/** The box the cursor is in, with its position, or null. */
export function boxAtCursor(state: EditorState): { node: PMNode; pos: number } | null {
  const { $from } = state.selection;
  if ($from.depth < 1) return null;
  return { node: $from.node(1), pos: $from.before(1) };
}

/** Somewhere visible and free on the page, for a box made from a toolbar. */
export function freeSpot(view: EditorView): { x: number; y: number } {
  const scroller = scrollParent(view.dom);
  const top = scroller ? scroller.scrollTop : 0;
  let y = top + 40;
  // Below the lowest box that starts in view, so new boxes do not land on others.
  for (const el of Array.from(view.dom.children) as HTMLElement[]) {
    const bottom = el.offsetTop + el.offsetHeight;
    if (el.offsetTop >= top && el.offsetTop < top + 600) y = Math.max(y, bottom + 24);
  }
  return { x: 40, y };
}

/** Puts the cursor in a box, making one if the page has none or the cursor is outside them. */
export function ensureBox(view: EditorView): void {
  if (boxAtCursor(view.state) !== null) return;
  addBox(view, freeSpot(view));
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
function pagePoint(view: EditorView, event: { clientX: number; clientY: number }) {
  const rect = view.dom.getBoundingClientRect();
  return { x: Math.round(event.clientX - rect.left), y: Math.round(event.clientY - rect.top) };
}

/** Image files among dropped or pasted files. */
function imageFiles(files: FileList | null | undefined): File[] {
  return Array.from(files ?? []).filter((f) => f.type.startsWith('image/'));
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Could not read the image'));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Puts images in the page: at the cursor, or in a new box at `point`.
 * The spike keeps them in the page as data; the app will save them to
 * attachments/, as it does for pages now.
 */
export async function insertImages(
  view: EditorView,
  files: File[],
  point?: { x: number; y: number },
): Promise<void> {
  const image = view.state.schema.nodes['image'];
  const paragraph = view.state.schema.nodes['paragraph'];
  if (!image || !paragraph || files.length === 0) return;
  const urls = await Promise.all(files.map(readAsDataUrl));
  const nodes = urls.map((src, i) => image.create({ src, alt: files[i]?.name ?? '' }));
  if (point) {
    addBox(view, { ...point }, Fragment.from(nodes.map((n) => paragraph.create(null, n))));
    return;
  }
  ensureBox(view);
  view.dispatch(view.state.tr.replaceSelectionWith(nodes[0] ?? image.create()).scrollIntoView());
  for (const node of nodes.slice(1)) view.dispatch(view.state.tr.replaceSelectionWith(node));
  view.focus();
}

/** Boxes whose drawn area meets a rectangle on screen, as document indexes. */
function boxesIn(view: EditorView, rect: DOMRect): number[] {
  const hits: number[] = [];
  Array.from(view.dom.children).forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (r.right > rect.left && r.left < rect.right && r.bottom > rect.top && r.top < rect.bottom) {
      hits.push(i);
    }
  });
  return hits;
}

/**
 * A press on empty page: a click makes a box there; a drag draws a
 * rectangle and selects the text of every box it touches, as OneNote does.
 */
function pressOnPage(view: EditorView, down: MouseEvent): void {
  let band: HTMLDivElement | null = null;
  const area = () =>
    new DOMRect(
      Math.min(down.clientX, last.clientX),
      Math.min(down.clientY, last.clientY),
      Math.abs(last.clientX - down.clientX),
      Math.abs(last.clientY - down.clientY),
    );
  let last: { clientX: number; clientY: number } = down;
  const onMove = (e: MouseEvent) => {
    last = e;
    if (!band && Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < CLICK_SLOP)
      return;
    if (!band) {
      band = document.createElement('div');
      band.className = 'free-band';
      document.body.append(band);
    }
    const r = area();
    Object.assign(band.style, {
      left: `${String(r.left)}px`,
      top: `${String(r.top)}px`,
      width: `${String(r.width)}px`,
      height: `${String(r.height)}px`,
    });
  };
  const onUp = (e: MouseEvent) => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    last = e;
    if (!band) {
      const p = pagePoint(view, down);
      // The cursor lands on the first line, where the click was.
      addBox(view, { x: Math.max(0, p.x - 8), y: Math.max(0, p.y - 14) });
      return;
    }
    band.remove();
    const hits = boxesIn(view, area());
    const first = hits[0];
    const lastHit = hits.at(-1);
    if (first === undefined || lastHit === undefined) return;
    const { doc } = view.state;
    const start = posOfIndex(doc, first) + 1;
    const end = posOfIndex(doc, lastHit) + doc.child(lastHit).nodeSize - 1;
    view.dispatch(
      view.state.tr.setSelection(TextSelection.between(doc.resolve(start), doc.resolve(end))),
    );
    view.focus();
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

const freeKey = new PluginKey('free-layout');

/**
 * Clicking empty page makes a box there and dragging selects boxes;
 * dropping or pasting on empty page makes a box holding it; boxes left
 * empty when the cursor leaves them go away; the page grows to fit.
 */
export const FreeLayout = Extension.create({
  name: 'freeLayout',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: freeKey,
        // The page is always taller than its lowest box, so there is room below to write.
        view: (view) => {
          const grow = () => {
            let bottom = 0;
            for (const el of Array.from(view.dom.children) as HTMLElement[]) {
              bottom = Math.max(bottom, el.offsetTop + el.offsetHeight);
            }
            view.dom.parentElement?.style.setProperty(
              '--free-height',
              `${String(Math.max(1600, bottom + 800))}px`,
            );
          };
          grow();
          return { update: grow };
        },
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
              pressOnPage(view, event);
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
          handlePaste: (view, event, slice) => {
            // Pictures, such as a screenshot: at the cursor.
            const images = imageFiles(event.clipboardData?.files);
            if (images.length > 0) {
              event.preventDefault();
              void insertImages(view, images);
              return true;
            }
            // Pasted boxes are not placed again: their text goes where the cursor is.
            const hasBoxes = slice.content.firstChild?.type.name === 'box';
            if (!hasBoxes && !spansBoxes(view.state)) return false;
            const tr = spansBoxes(view.state) ? deleteAcross(view.state.tr) : view.state.tr;
            const content = hasBoxes ? new Slice(blocksOf(view, slice), 0, 0) : slice;
            view.dispatch(tr.replaceSelection(content).scrollIntoView());
            return true;
          },
          handleDrop: (view, event, slice, moved) => {
            const onPage = event.target === view.dom;
            const images = imageFiles(event.dataTransfer?.files);
            if (images.length > 0) {
              event.preventDefault();
              if (onPage) {
                void insertImages(view, images, pagePoint(view, event));
              } else {
                const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
                if (at)
                  view.dispatch(
                    view.state.tr.setSelection(TextSelection.create(view.state.doc, at.pos)),
                  );
                void insertImages(view, images);
              }
              return true;
            }
            if (!onPage) return false;
            event.preventDefault();
            const p = pagePoint(view, event);
            const content = blocksOf(view, slice);
            if (moved) {
              const { state } = view;
              view.dispatch(
                spansBoxes(state) ? deleteAcross(state.tr) : state.tr.deleteSelection(),
              );
            }
            addBox(view, { x: p.x, y: p.y }, content);
            return true;
          },
        },
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((t) => t.docChanged || t.selectionSet)) return null;
          const { from } = state.selection;
          const empty: { pos: number; size: number }[] = [];
          state.doc.forEach((box, pos) => {
            // Sticky notes stay even when empty; plain boxes go.
            const blank =
              box.attrs['colour'] === null &&
              box.childCount === 1 &&
              box.textContent === '' &&
              box.firstChild?.type.name === 'paragraph' &&
              box.firstChild.childCount === 0;
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
      link: { openOnClick: false, autolink: true, linkOnPaste: true },
    }),
    FreeDoc,
    Box,
    FreeLayout,
    Highlight,
    Image.configure({ inline: true, allowBase64: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder: 'Type here', includeChildren: true }),
    Collaboration.configure({ document: ydoc, field: 'default' }),
  ];
}
