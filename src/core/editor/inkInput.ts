import { Extension, type Editor } from '@tiptap/core';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { addBox, freeSpot, hasBoxes, type FreeLayoutStorage } from './freeLayout';
import { BOX, WIKI_LINK } from './markdown/model';

/**
 * Writing with the pen anywhere on a page. On a document page, the pen
 * touching the page adds a drawing below the block it touched; on a free
 * layout page, touching empty page starts a drawing in a new box there.
 * The pen then writes in the drawing. Mice and fingers are unchanged.
 */

export interface InkInputOptions {
  /** A new drawing's embed target, such as `attachments/Ink ....ink.json`; null where drawings cannot be added. */
  newTarget: (() => string) | null;
  /** Whether the pen is set to write (pen or highlighter), not erase. */
  writing: () => boolean;
}

/** A drawing's width on a free layout page. */
const FREE_INK_WIDTH = 480;

function isFree(editor: Editor): boolean {
  const storage = (editor.storage as unknown as { freeLayout?: FreeLayoutStorage }).freeLayout;
  return storage?.layout === 'free' && hasBoxes(editor.state.doc);
}

/** A paragraph holding only the drawing's embed. */
function drawingBlock(view: EditorView, target: string): PMNode | null {
  const { schema } = view.state;
  const link = schema.nodes[WIKI_LINK];
  const paragraph = schema.nodes['paragraph'];
  if (!link || !paragraph) return null;
  return paragraph.create(null, link.create({ target, alias: null, embed: true }));
}

/** Inserts the drawing as a block after the block at `pos`, and puts the cursor after it. */
function insertAfterBlock(view: EditorView, pos: number, target: string): void {
  const block = drawingBlock(view, target);
  if (!block) return;
  const { doc } = view.state;
  const $pos = doc.resolve(Math.min(pos, doc.content.size));
  // The block the position is in: a top-level block, or one inside a box.
  const depth = hasBoxes(doc) ? 2 : 1;
  // Free layout pages only reach here inside a box; elsewhere, the end of the page.
  const at = $pos.depth >= depth ? $pos.after(depth) : doc.content.size;
  const tr = view.state.tr.insert(at, block);
  tr.setSelection(
    TextSelection.near(tr.doc.resolve(Math.min(at + block.nodeSize, tr.doc.content.size))),
  );
  view.dispatch(tr.scrollIntoView());
}

/** Adds a drawing where the pen touched the page. */
export function drawAt(
  editor: Editor,
  target: string,
  point: { clientX: number; clientY: number; onEmptyPage: boolean },
): void {
  const { view } = editor;
  const found = view.posAtCoords({ left: point.clientX, top: point.clientY });
  const inBox = found !== null && view.state.doc.resolve(found.pos).depth >= 2;
  if (isFree(editor) && (point.onEmptyPage || !inBox)) {
    const block = drawingBlock(view, target);
    if (!block) return;
    const rect = view.dom.getBoundingClientRect();
    addBox(
      view,
      {
        x: Math.max(0, Math.round(point.clientX - rect.left - 24)),
        y: Math.max(0, Math.round(point.clientY - rect.top - 36)),
        w: FREE_INK_WIDTH,
      },
      Fragment.from(block),
      // Focus would wake the tablet's handwriting-to-text; the pen draws here.
      false,
    );
    return;
  }
  insertAfterBlock(view, found?.pos ?? view.state.doc.content.size, target);
}

/** Adds a drawing at the cursor, or in a new box on a free layout page with no box chosen. */
export function drawAtCursor(editor: Editor, target: string): void {
  const { view } = editor;
  const { $from } = view.state.selection;
  const inBox = $from.depth >= 1 && $from.node(1).type.name === BOX;
  if (isFree(editor) && !inBox) {
    const block = drawingBlock(view, target);
    if (block) addBox(view, { ...freeSpot(view), w: FREE_INK_WIDTH }, Fragment.from(block));
    return;
  }
  insertAfterBlock(view, view.state.selection.from, target);
  view.focus();
}

const inkKey = new PluginKey('inkInput');

export const InkInput = Extension.create<InkInputOptions>({
  name: 'inkInput',

  addOptions() {
    return { newTarget: null, writing: () => true };
  },

  addProseMirrorPlugins() {
    const { newTarget, writing } = this.options;
    const editor = this.editor;
    return [
      new Plugin({
        key: inkKey,
        props: {
          handleDOMEvents: {
            pointerdown: (view, event) => {
              if (event.pointerType !== 'pen' || newTarget === null || !view.editable) return false;
              if (!writing() || event.button === 5 || (event.buttons & 32) !== 0) return false;
              const el = event.target as Element | null;
              // Drawings and the boxes' own handles take the pen themselves.
              if (el?.closest('.ink-embed, .box-handle, .box-resize, .box-delete')) return false;
              event.preventDefault();
              drawAt(editor, newTarget(), {
                clientX: event.clientX,
                clientY: event.clientY,
                onEmptyPage: event.target === view.dom,
              });
              return true;
            },
          },
        },
      }),
    ];
  },
});
