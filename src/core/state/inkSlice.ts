import type { PenSettings } from '../ink/surface';
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
}

export function createInkSlice(ctx: StoreContext): InkSlice {
  const { set, get } = ctx;
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
  };
}
