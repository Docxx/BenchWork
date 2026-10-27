import { Extension, Mark, Node, mergeAttributes, type Editor } from '@tiptap/core';
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { FileSource, IncomingFile } from '../pages/attachments';
import { insertFiles, toIncoming, type AddedFileRef } from './fileInput';
import {
  BOX,
  BOX_COLOURS,
  DEFAULT_BOX_WIDTH,
  type BoxAttrs,
  type BoxColour,
} from './markdown/model';

/**
 * Free layout pages: the page's blocks sit in boxes placed anywhere on the
 * page, and people write wherever they click. It is still one document, so
 * cut, copy, paste, selection across boxes and undo all work as on any
 * page. Boxes are kept in reading order (top to bottom, then left to
 * right), so arrow keys, screen readers and the saved Markdown follow the
 * page as it reads.
 *
 * In document view the same boxes are shown one after another, and the
 * clicks, drags and drops below are off; switching back puts every box
 * where it was.
 */

const MIN_WIDTH = 120;
const MIN_HEIGHT = 40;
/** How far the pointer may move before a press on empty page counts as a drag. */
const CLICK_SLOP = 5;

export type Layout = 'free' | 'document';

/** ==highlighted== text. */
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

/** A page holds blocks, or boxes of blocks on a free layout page; never both. */
export const PageDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: 'block+ | box+',
});

/** The nearest ancestor that scrolls. */
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
  name: BOX,
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
      w: number('w', DEFAULT_BOX_WIDTH),
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
      const place = (p: BoxAttrs) => {
        dom.style.left = `${String(p.x)}px`;
        dom.style.top = `${String(p.y)}px`;
        dom.style.width = `${String(p.w)}px`;
        dom.style.minHeight = p.h > 0 ? `${String(p.h)}px` : '';
      };
      const show = (n: PMNode) => {
        place(n.attrs as BoxAttrs);
        const colour = n.attrs['colour'] as BoxColour | null;
        dom.dataset['colour'] = colour ?? '';
        dom.classList.toggle('sticky', colour !== null);
      };
      show(current);

      /** Follows the pointer, scrolling near the edges, then saves the new place in one step. */
      const drag = (
        start: PointerEvent,
        change: (from: BoxAttrs, dx: number, dy: number) => Partial<BoxAttrs>,
      ) => {
        start.preventDefault();
        const target = start.currentTarget as HTMLElement;
        target.setPointerCapture(start.pointerId);
        dom.classList.add('moving');
        const scroller = scrollParent(dom);
        const startScroll = scroller?.scrollTop ?? 0;
        const from = current.attrs as BoxAttrs;
        let next = from;
        const onMove = (e: PointerEvent) => {
          nudgeScroll(scroller, e.clientY);
          const scrolled = (scroller?.scrollTop ?? 0) - startScroll;
          next = {
            ...from,
            ...change(from, e.clientX - start.clientX, e.clientY - start.clientY + scrolled),
          };
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

      /** The box's height now, as drawn, for resizing from it. */
      const drawnHeight = () => Math.round(dom.getBoundingClientRect().height);
      const width = (f: BoxAttrs, dx: number) => Math.max(MIN_WIDTH, Math.round(f.w + dx));
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

/** Where a box at `place` belongs among the page's boxes, so arrow keys follow reading order. */
function indexFor(doc: PMNode, place: { x: number; y: number }, skip = -1): number {
  let index = 0;
  doc.forEach((child, _offset, i) => {
    if (i !== skip && readingOrder(child.attrs as BoxAttrs, place) <= 0) index += 1;
  });
  return index;
}

function posOfIndex(doc: PMNode, index: number): number {
  let pos = 0;
  for (let i = 0; i < index && i < doc.childCount; i += 1) pos += doc.child(i).nodeSize;
  return pos;
}

/** Whether the page's blocks are in boxes. */
export function hasBoxes(doc: PMNode): boolean {
  return doc.firstChild?.type.name === BOX;
}

/** Moves or resizes the box at `pos`, keeping it in its place in reading order. */
export function moveBox(tr: Transaction, pos: number, place: Partial<BoxAttrs>): Transaction {
  const node = tr.doc.nodeAt(pos);
  if (node?.type.name !== BOX) return tr;
  const attrs = { ...node.attrs, ...place } as BoxAttrs;
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
  const box = state.schema.nodes[BOX];
  if (!paragraph || !box || !hasBoxes(state.doc)) return;
  const inner = content && content.size > 0 ? content : Fragment.from(paragraph.create());
  const attrs = { w: DEFAULT_BOX_WIDTH, h: 0, colour: null, ...place };
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
  if ($from.depth < 1 || $from.node(1).type.name !== BOX) return null;
  return { node: $from.node(1), pos: $from.before(1) };
}

/** Sets the colour of the box the cursor is in; any colour makes it a sticky note. */
export function setBoxColour(editor: Editor, colour: BoxColour | null): void {
  const box = boxAtCursor(editor.state);
  if (!box) return;
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(box.pos, undefined, { ...box.node.attrs, colour }),
  );
  editor.view.focus();
}

/** Somewhere visible and free on the page, for a box made from the toolbar. */
export function freeSpot(view: EditorView): { x: number; y: number } {
  const scroller = scrollParent(view.dom);
  const top = Math.max(0, (scroller?.scrollTop ?? 0) - view.dom.offsetTop);
  let y = top + 40;
  // Below boxes that start in view, so a new box does not land on another.
  for (const el of Array.from(view.dom.children) as HTMLElement[]) {
    if (el.offsetTop >= top && el.offsetTop < top + 600) {
      y = Math.max(y, el.offsetTop + el.offsetHeight + 24);
    }
  }
  return { x: 40, y };
}

/** Puts a free page's blocks in one box, so it can be laid out freely. */
export function wrapInBox(editor: Editor): void {
  const { state } = editor;
  const box = state.schema.nodes[BOX];
  if (!box || hasBoxes(state.doc)) return;
  const node = box.create({ x: 40, y: 40, w: 640, h: 0, colour: null }, state.doc.content);
  editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, node));
}

/** Blocks for a box from a pasted or dropped slice: inline content goes in a paragraph. */
function blocksOf(view: EditorView, slice: Slice): Fragment {
  const paragraph = view.state.schema.nodes['paragraph'];
  const first = slice.content.firstChild;
  if (first?.type.name === BOX) {
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
  if (!hasBoxes(state.doc)) return false;
  const { $from, $to } = state.selection;
  return $from.index(0) !== $to.index(0);
}

/**
 * Deletes a selection that reaches across boxes, box by box: each box
 * loses only the selected part and stays where it is; boxes wholly
 * selected go, unless that would leave the page with none. Plain deleting
 * would join what is left of the first and last boxes into one.
 */
export function deleteAcross(tr: Transaction): Transaction {
  const { from, to } = tr.selection;
  const parts: { from: number; to: number; whole: boolean }[] = [];
  tr.doc.forEach((box, pos) => {
    const start = pos + 1;
    const end = pos + box.nodeSize - 1;
    if (to <= start || from >= end) return;
    const whole = from <= start && to >= end;
    parts.push(
      whole
        ? { from: pos, to: pos + box.nodeSize, whole }
        : { from: Math.max(from, start), to: Math.min(to, end), whole },
    );
  });
  // A page keeps at least one box: the last wholly selected one is emptied instead.
  if (parts.length === tr.doc.childCount && parts.every((p) => p.whole)) {
    const lastPart = parts.at(-1);
    if (lastPart)
      parts[parts.length - 1] = { from: lastPart.from + 1, to: lastPart.to - 1, whole: false };
  }
  // From the end, so earlier positions stay put.
  for (const part of parts.reverse()) tr.delete(part.from, part.to);
  const at = Math.min(tr.mapping.map(from, -1), tr.doc.content.size);
  return tr.setSelection(TextSelection.near(tr.doc.resolve(at)));
}

/** The point on the page under a pointer event. */
function pagePoint(view: EditorView, event: { clientX: number; clientY: number }) {
  const rect = view.dom.getBoundingClientRect();
  return { x: Math.round(event.clientX - rect.left), y: Math.round(event.clientY - rect.top) };
}

/** Boxes whose drawn area meets a rectangle on screen, as indexes on the page. */
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
 * rectangle and selects the text of every box it touches.
 */
function pressOnPage(view: EditorView, down: MouseEvent): void {
  let band: HTMLDivElement | null = null;
  let last: { clientX: number; clientY: number } = down;
  const area = () =>
    new DOMRect(
      Math.min(down.clientX, last.clientX),
      Math.min(down.clientY, last.clientY),
      Math.abs(last.clientX - down.clientX),
      Math.abs(last.clientY - down.clientY),
    );
  const onMove = (e: MouseEvent) => {
    last = e;
    const moved = Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY);
    if (!band && moved < CLICK_SLOP) return;
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

export interface FreeLayoutOptions {
  /** Copies dropped files into the vault, as for any page; null where files cannot be added. */
  onFiles: ((files: IncomingFile[], source: FileSource) => Promise<AddedFileRef[]>) | null;
}

export interface FreeLayoutStorage {
  layout: Layout;
}

/** Sets how the open page is laid out; the page's own class shows it. */
export function setLayout(editor: Editor, layout: Layout): void {
  (editor.storage as unknown as { freeLayout: FreeLayoutStorage }).freeLayout.layout = layout;
}

const freeKey = new PluginKey('freeLayout');

/**
 * What makes a free layout page work: clicking empty page makes a box and
 * dragging selects boxes; dropping text or files on empty page makes a box
 * holding them; cut, delete and typing across boxes keep them apart;
 * pasted boxes give up their text; boxes left empty when the cursor
 * leaves them go; and the page grows to fit.
 */
export const FreeLayout = Extension.create<FreeLayoutOptions, FreeLayoutStorage>({
  name: 'freeLayout',

  addOptions() {
    return { onFiles: null };
  },

  addStorage() {
    return { layout: 'document' };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    const editor = this.editor;
    const { onFiles } = this.options;
    /** Whether the free layout's clicks, drags and drops are on. */
    const free = (state: EditorState) => storage.layout === 'free' && hasBoxes(state.doc);

    return [
      new Plugin({
        key: freeKey,
        // The page is always taller than its lowest box, so there is room below to write.
        view: (view) => {
          const grow = () => {
            let bottom = 0;
            let right = 0;
            if (hasBoxes(view.state.doc)) {
              for (const el of Array.from(view.dom.children) as HTMLElement[]) {
                bottom = Math.max(bottom, el.offsetTop + el.offsetHeight);
                right = Math.max(right, el.offsetLeft + el.offsetWidth);
              }
            }
            view.dom.style.setProperty('--free-height', `${String(Math.max(900, bottom + 600))}px`);
            view.dom.style.setProperty('--free-width', `${String(right + 200)}px`);
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
              if (event.button !== 0 || event.target !== view.dom || !free(view.state)) {
                return false;
              }
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
            // Files are added by the page's own file handling, at the cursor.
            if ((event.clipboardData?.files.length ?? 0) > 0) return false;
            // Pasted boxes are not placed again: their text goes where the cursor is.
            const pastedBoxes = slice.content.firstChild?.type.name === BOX;
            if (!pastedBoxes && !spansBoxes(view.state)) return false;
            const tr = spansBoxes(view.state) ? deleteAcross(view.state.tr) : view.state.tr;
            const content = pastedBoxes ? new Slice(blocksOf(view, slice), 0, 0) : slice;
            view.dispatch(tr.replaceSelection(content).scrollIntoView());
            return true;
          },
          handleDrop: (view, event, slice, moved) => {
            if (!free(view.state) || event.target !== view.dom) return false;
            event.preventDefault();
            const p = pagePoint(view, event);
            const files = Array.from(event.dataTransfer?.files ?? []);
            if (files.length > 0) {
              // A new box where they were dropped, holding the added files.
              if (onFiles === null) return true;
              addBox(view, p);
              const at = view.state.selection.from;
              void onFiles(files.map(toIncoming), 'drop').then((added) => {
                insertFiles(editor, at, added);
              });
              return true;
            }
            const content = blocksOf(view, slice);
            if (moved) {
              const { state } = view;
              view.dispatch(
                spansBoxes(state) ? deleteAcross(state.tr) : state.tr.deleteSelection(),
              );
            }
            addBox(view, p, content);
            return true;
          },
        },
        appendTransaction: (transactions, _old, state) => {
          if (!hasBoxes(state.doc) || !transactions.some((t) => t.docChanged || t.selectionSet)) {
            return null;
          }
          const { from } = state.selection;
          const empty: { pos: number; size: number }[] = [];
          state.doc.forEach((box, pos) => {
            // Sticky notes stay even when empty; plain boxes go.
            const blank =
              box.attrs['colour'] === null &&
              box.childCount === 1 &&
              box.firstChild?.type.name === 'paragraph' &&
              box.firstChild.childCount === 0;
            const holdsCursor = from > pos && from < pos + box.nodeSize;
            if (blank && !holdsCursor) empty.push({ pos, size: box.nodeSize });
          });
          // A free page keeps at least one box.
          if (empty.length === state.doc.childCount) empty.shift();
          if (empty.length === 0) return null;
          const tr = state.tr;
          for (const e of empty.reverse()) tr.delete(e.pos, e.pos + e.size);
          return tr.setMeta('addToHistory', false);
        },
      }),
    ];
  },
});

export { BOX_COLOURS };
