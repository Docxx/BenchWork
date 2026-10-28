import { emptyInk, inkBounds, type Ink, type InkPoint, type InkStroke } from '../ink/inkFile';
import { InkSurface, type SurfaceHooks } from '../ink/surface';

/**
 * `![[attachments/Ink ....ink.json]]`: a drawing in the page. The ink is
 * its own file, written as strokes are added; the page holds only the
 * embed, so the Markdown stays readable anywhere.
 */

/** How the editor reads and writes drawings; given by the app for the open page. */
export interface InkAccess {
  /** The drawing, a new empty one if the file does not exist yet, or null if it cannot be read. */
  load: (target: string) => Promise<Ink | null>;
  save: (target: string, ink: Ink) => Promise<void>;
  /** The pen tools, and whether the page is dark. */
  hooks: Omit<SurfaceHooks, 'onChange'>;
  /** Called when a drawing shows, so the pen tools can show too. */
  shown?: () => void;
}

/** A new drawing's size, and how much it grows when writing nears its bottom. */
export const NEW_INK_HEIGHT = 200;
const GROW_BY = 160;
const GROW_MARGIN = 48;
const MIN_HEIGHT = 80;

/** Writing nearer the top than this makes the drawing grow upwards, in CSS pixels. */
const TOP_MARGIN = 6;
/** How much room it then leaves above the highest stroke. */
const TOP_ROOM = 24;

/** How far to move strokes down so none is cut off at the top; 0 if none is. */
export function roomAbove(strokes: readonly InkStroke[]): number {
  const bounds = inkBounds(strokes);
  if (!bounds || bounds.y >= TOP_MARGIN) return 0;
  return Math.ceil(TOP_ROOM - bounds.y);
}

/** The strokes moved down by dy. */
export function shiftDown(strokes: readonly InkStroke[], dy: number): InkStroke[] {
  return strokes.map((s) => ({
    ...s,
    points: s.points.map(([x, y, p, t]): InkPoint => [x, Math.round((y + dy) * 100) / 100, p, t]),
  }));
}

/** The ink's height after strokes: taller when they come near the bottom. */
export function grownHeight(height: number, strokes: readonly InkStroke[]): number {
  const bounds = inkBounds(strokes);
  if (!bounds) return height;
  const bottom = bounds.y + bounds.h;
  return bottom > height - GROW_MARGIN ? Math.ceil(bottom + GROW_BY) : height;
}

export function inkEmbedView(
  target: string,
  access: InkAccess,
  page: {
    editable: () => boolean;
    /** Takes the drawing out of the page; its file stays, as with any embed. */
    remove: () => void;
    /** The drawing grew upwards by dy: its box, if it is in one, moves up to match. */
    grewUp?: (dy: number) => void;
  },
): { dom: HTMLElement; destroy: () => void } {
  const { editable } = page;
  const dom = document.createElement('span');
  dom.className = 'ink-embed';
  dom.contentEditable = 'false';
  dom.dataset['wikiLink'] = '';
  dom.dataset['target'] = target;
  dom.dataset['embed'] = '';
  const host = document.createElement('span');
  host.className = 'ink-area';
  host.setAttribute('role', 'img');
  host.setAttribute('aria-label', 'Drawing');
  host.style.height = `${String(NEW_INK_HEIGHT)}px`;
  const resize = document.createElement('span');
  resize.className = 'ink-resize';
  resize.title = 'Drag to change the height';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'ink-delete';
  remove.title = 'Delete drawing';
  remove.setAttribute('aria-label', 'Delete drawing');
  remove.textContent = '×';
  remove.addEventListener('click', (e) => {
    e.preventDefault();
    page.remove();
  });
  dom.append(host, resize, remove);

  let ink: Ink = emptyInk(0, NEW_INK_HEIGHT);
  let surface: InkSurface | null = null;
  let live = true;
  let saving = Promise.resolve();

  const show = (height: number) => {
    ink = { ...ink, height };
    host.style.height = `${String(height)}px`;
  };
  const save = () => {
    const width = Math.max(ink.width, Math.round(host.getBoundingClientRect().width));
    ink = { ...ink, width };
    const copy = ink;
    saving = saving.then(() => access.save(target, copy)).catch(() => undefined);
  };

  void access.load(target).then((loaded) => {
    if (!live) return;
    if (loaded === null) {
      dom.classList.add('missing');
      dom.title = `This drawing could not be read: ${target}`;
      return;
    }
    ink = loaded;
    show(Math.max(MIN_HEIGHT, loaded.height || NEW_INK_HEIGHT));
    surface = new InkSurface(host, loaded.strokes, {
      ...access.hooks,
      onChange: (written) => {
        // Writing above the top grows the drawing upwards, so nothing is cut off.
        const dy = roomAbove(written);
        const strokes = dy > 0 ? shiftDown(written, dy) : written;
        ink = { ...ink, strokes };
        show(grownHeight(ink.height + dy, strokes));
        if (dy > 0) {
          surface?.setStrokes(strokes);
          page.grewUp?.(dy);
        }
        save();
      },
    });
    surface.setEditable(editable());
    host.classList.toggle('editable', editable());
    access.shown?.();
  });

  // Dragging the bottom edge makes the drawing taller or shorter.
  resize.addEventListener('pointerdown', (start) => {
    start.preventDefault();
    start.stopPropagation();
    resize.setPointerCapture(start.pointerId);
    const from = ink.height;
    const onMove = (e: PointerEvent) => {
      show(Math.max(MIN_HEIGHT, Math.round(from + e.clientY - start.clientY)));
    };
    const onUp = () => {
      resize.removeEventListener('pointermove', onMove);
      resize.removeEventListener('pointerup', onUp);
      resize.removeEventListener('pointercancel', onUp);
      if (ink.height !== from) save();
    };
    resize.addEventListener('pointermove', onMove);
    resize.addEventListener('pointerup', onUp);
    resize.addEventListener('pointercancel', onUp);
  });

  return {
    dom,
    destroy: () => {
      live = false;
      surface?.destroy();
    },
  };
}
