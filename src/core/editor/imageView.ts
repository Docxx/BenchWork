import type { Editor, NodeViewRendererProps } from '@tiptap/core';
import type { Node as PMNodeType } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import type { NodeView } from '@tiptap/pm/view';
import { clampWidth, stepWidth, type ImageSize } from './imageSize';

/**
 * How an image shows in the editor. Selecting it shows a handle to drag
 * for a new width, and Smaller, Larger and Original size buttons, so it can
 * be resized without dragging too. The size is saved in the node's
 * attributes as Obsidian writes it; the image file is never changed.
 */

export interface ImageViewOptions {
  url: string | null;
  /** Shown as alt text, and in the chip if the file is missing. */
  label: string;
  title: string | null;
  size: ImageSize | null;
  /** The node's attributes with a new size, or none for the original size. */
  withSize: (size: ImageSize | null) => Record<string, unknown>;
  /** The chip shown when the file cannot be loaded. */
  missing: () => HTMLElement;
}

function button(label: string, onPress: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  // Mouse down, not click, so the image stays selected.
  b.addEventListener('mousedown', (e) => {
    e.preventDefault();
    onPress();
  });
  return b;
}

/** Widest an image may be: the width of the page's text. */
function maxWidth(editor: Editor): number {
  const style = getComputedStyle(editor.view.dom);
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  return Math.max(editor.view.dom.clientWidth - (Number.isNaN(padding) ? 0 : padding), 0);
}

export function imageView(
  props: Pick<NodeViewRendererProps, 'editor' | 'getPos'> & { node: PMNodeType },
  options: ImageViewOptions,
): NodeView {
  const { editor, getPos, node } = props;
  const frame = document.createElement('span');
  frame.className = 'image-frame';

  if (options.url === null) {
    frame.append(options.missing());
    return { dom: frame, update: (next) => next.type === node.type && next.attrs === node.attrs };
  }

  const img = document.createElement('img');
  img.src = options.url;
  img.alt = options.label;
  img.className = 'page-image';
  if (options.title) img.title = options.title;
  if (options.size) {
    img.style.width = `${String(options.size.width)}px`;
    if (options.size.height !== null) img.style.height = `${String(options.size.height)}px`;
  }
  img.addEventListener('error', () => {
    frame.replaceChildren(options.missing());
  });

  /** Saves a new size, keeping the image selected. */
  const commit = (size: ImageSize | null) => {
    const pos = getPos();
    if (typeof pos !== 'number') return;
    const tr = editor.state.tr.setNodeMarkup(pos, undefined, options.withSize(size));
    tr.setSelection(NodeSelection.create(tr.doc, pos));
    editor.view.dispatch(tr);
  };
  const width = () => img.getBoundingClientRect().width || img.naturalWidth;

  const handle = document.createElement('span');
  handle.className = 'resize-handle';
  handle.title = 'Drag to resize';
  handle.draggable = false;
  handle.addEventListener('pointerdown', (down) => {
    down.preventDefault();
    down.stopPropagation();
    handle.setPointerCapture(down.pointerId);
    const startX = down.clientX;
    const startWidth = width();
    const max = maxWidth(editor);
    let next = startWidth;
    const move = (e: PointerEvent) => {
      next = clampWidth(startWidth + e.clientX - startX, max);
      img.style.width = `${String(next)}px`;
      img.style.height = 'auto';
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      if (Math.round(next) !== Math.round(startWidth)) commit({ width: next, height: null });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });

  const bar = document.createElement('span');
  bar.className = 'image-size-bar';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Image size');
  bar.append(
    button('Smaller', () => {
      commit({ width: stepWidth(width(), -1, maxWidth(editor)), height: null });
    }),
    button('Larger', () => {
      commit({ width: stepWidth(width(), 1, maxWidth(editor)), height: null });
    }),
    button('Original size', () => {
      commit(null);
    }),
  );

  frame.append(img, handle, bar);
  const inControls = (target: EventTarget | null) =>
    target instanceof Node && (handle.contains(target) || bar.contains(target));

  return {
    dom: frame,
    update: (next) => next.type === node.type && next.attrs === node.attrs,
    selectNode: () => {
      frame.classList.add('selected');
    },
    deselectNode: () => {
      frame.classList.remove('selected');
    },
    // The handle and buttons handle their own events; the image itself can still be dragged.
    stopEvent: (event) => inControls(event.target),
    // Live resizing changes styles only; ProseMirror need not redraw.
    ignoreMutation: () => true,
  };
}
