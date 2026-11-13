import { emptyInk, newInkName, parseInk, serialiseInk, type Ink } from '../ink/inkFile';
import type { PenSettings } from '../ink/surface';
import { MAX_PENS, saveAppSettings, type PenMode, type SavedPen } from '../settings/appSettings';
import { ATTACHMENTS_DIR, embedPath } from '../pages/attachments';
import { describeError, type StoreContext } from './context';

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
  /** Keeps the pen in use as a favourite, or removes one; saved on this device. */
  savePen: () => Promise<void>;
  removePen: (index: number) => Promise<void>;
  /** Draw with the pen, or let the system turn handwriting into text; saved on this device. */
  setPenMode: (mode: PenMode) => Promise<void>;
  /** Tells the system whether to turn pen writing into text, as the saved mode says. */
  applyPenMode: () => void;
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

/** The tool if it writes ink with a colour and width, or null. */
function inkTool(tool: string): 'pen' | 'highlighter' | null {
  return tool === 'pen' || tool === 'highlighter' ? tool : null;
}

export function createInkSlice(ctx: StoreContext): InkSlice {
  const { platform, set, get } = ctx;
  /** Drawings whose files could not be read, so they are never written over. */
  const unreadable = new Set<string>();
  const remembered: Record<'pen' | 'highlighter', { colour: string; width: number }> = {
    pen: { colour: PEN_COLOURS[0].value, width: PEN_WIDTHS[1].value },
    highlighter: { colour: HIGHLIGHTER_COLOURS[0].value, width: PEN_WIDTHS[1].value },
  };
  const savePens = async (pens: SavedPen[]) => {
    const settings = { ...get().settings, pens };
    set({ settings });
    try {
      await saveAppSettings(platform, settings);
    } catch (err) {
      set({ settingsError: `Your pens could not be saved. ${describeError(err)}` });
    }
  };
  return {
    pen: { tool: 'pen', colour: PEN_COLOURS[0].value, width: PEN_WIDTHS[1].value },
    penSeen: false,

    setPen: (changes) => {
      const before = get().pen;
      const pen = { ...before, ...changes };
      // Each tool remembers the colour and width it last had.
      const was = inkTool(before.tool);
      if (was !== null) remembered[was] = { colour: before.colour, width: before.width };
      const now = changes.tool === undefined ? null : inkTool(changes.tool);
      if (now !== null && changes.tool !== before.tool) {
        pen.colour = changes.colour ?? remembered[now].colour;
        pen.width = changes.width ?? remembered[now].width;
      }
      set({ pen });
    },

    savePen: async () => {
      const { colour, width } = get().pen;
      const tool = inkTool(get().pen.tool);
      if (tool === null) return;
      const same = (p: SavedPen) => p.tool === tool && p.colour === colour && p.width === width;
      const pens = get().settings.pens;
      if (pens.some(same)) return;
      await savePens([...pens, { tool, colour, width }].slice(-MAX_PENS));
    },

    removePen: async (index) => {
      await savePens(get().settings.pens.filter((_p, i) => i !== index));
    },

    setPenMode: async (penMode) => {
      const settings = { ...get().settings, penMode };
      set({ settings });
      get().applyPenMode();
      try {
        await saveAppSettings(platform, settings);
      } catch (err) {
        set({ settingsError: `The pen setting could not be saved. ${describeError(err)}` });
      }
    },

    applyPenMode: () => {
      platform.setStylusHandwriting(get().settings.penMode === 'text');
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
