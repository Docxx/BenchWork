import { emptyInk, newInkName, parseInk, serialiseInk, type Ink } from '../ink/inkFile';
import type { PenSettings } from '../ink/surface';
import { ATTACHMENTS_DIR, embedPath } from '../pages/attachments';
import type { StoreContext } from './context';

/** Pen colours to pick from: dark ink shows light on dark pages. */
export const PEN_COLOURS = [
  { name: 'Ink', value: '#1d2725' },
  { name: 'Blue', value: '#2f5fb3' },
  { name: 'Red', value: '#c0392b' },
  { name: 'Green', value: '#2e7d4f' },
  { name: 'Purple', value: '#7d5ba6' },
  { name: 'Orange', value: '#d9822b' },
] as const;

export const HIGHLIGHTER_COLOURS = [
  { name: 'Yellow', value: '#ffd84d' },
  { name: 'Green', value: '#7fd18b' },
  { name: 'Pink', value: '#ff8fab' },
  { name: 'Blue', value: '#7fb3f0' },
] as const;

export const PEN_WIDTHS = [
  { name: 'Fine', value: 1.5 },
  { name: 'Medium', value: 2.5 },
  { name: 'Bold', value: 4 },
] as const;

export interface InkSlice {
  /** What the pen writes with now. */
  pen: PenSettings;
  /** Whether a pen has been seen since the app opened: the pen tools show from then on. */
  penSeen: boolean;
  setPen: (changes: Partial<PenSettings>) => void;
  /** Called when a pen is seen; cheap to call on every pen movement. */
  notePen: () => void;
  /** Whether a drawing has been shown: the pen tools then show for the mouse too. */
  inkShown: boolean;
  noteInkShown: () => void;
  /** The embed target for a new drawing; its file is made when first written to. */
  newInkTarget: () => string;
  /** A drawing, empty if its file does not exist yet, or null if it cannot be read. */
  loadInk: (target: string) => Promise<Ink | null>;
  /** Writes a drawing; never over a file that could not be read. */
  saveInk: (target: string, ink: Ink) => Promise<void>;
}

export function createInkSlice(ctx: StoreContext): InkSlice {
  const { platform, set, get } = ctx;
  /** Drawings whose files could not be read, so they are never written over. */
  const unreadable = new Set<string>();
  return {
    pen: { tool: 'pen', colour: PEN_COLOURS[0].value, width: PEN_WIDTHS[1].value },
    penSeen: false,

    setPen: (changes) => {
      const pen = { ...get().pen, ...changes };
      // Each tool keeps to its own colours.
      if (
        changes.tool === 'highlighter' &&
        !HIGHLIGHTER_COLOURS.some((c) => c.value === pen.colour)
      )
        pen.colour = HIGHLIGHTER_COLOURS[0].value;
      if (changes.tool === 'pen' && !PEN_COLOURS.some((c) => c.value === pen.colour))
        pen.colour = PEN_COLOURS[0].value;
      set({ pen });
    },

    notePen: () => {
      if (!get().penSeen) set({ penSeen: true });
    },

    inkShown: false,
    noteInkShown: () => {
      if (!get().inkShown) set({ inkShown: true });
    },

    newInkTarget: () => `${ATTACHMENTS_DIR}/${newInkName()}`,

    loadInk: async (target) => {
      const path = embedPath(target);
      if (path === null) return null;
      if (!(await platform.exists(path))) return emptyInk(0, 0);
      try {
        const { ink, error } = parseInk(await platform.readText(path));
        if (error === null) {
          unreadable.delete(path);
          return ink;
        }
      } catch {
        // Unreadable, as below.
      }
      unreadable.add(path);
      return null;
    },

    saveInk: async (target, ink) => {
      const path = embedPath(target);
      if (path === null || unreadable.has(path)) return;
      await platform.ensureDir(path.slice(0, path.lastIndexOf('/')));
      await platform.writeTextAtomic(path, serialiseInk(ink));
    },
  };
}
