/**
 * A figure: panels of images on a page of real size, with labels round the
 * grid, saved as `<name>.figure.json`. Sizes are in millimetres, so a figure
 * prints and exports at the size a journal asks for. Images are never
 * changed: a panel keeps how its image is cropped, turned and adjusted.
 */

export const FIGURE_ENDING = '.figure.json';

/** Journal column widths, in mm. */
export const PAGE_WIDTHS = [
  { name: 'Single column', width: 85 },
  { name: 'One and a half columns', width: 114 },
  { name: 'Double column', width: 174 },
] as const;

/** How an image sits in its panel: zoom 1 fills the panel; the centre is a share of the image. */
export interface Crop {
  zoom: number;
  /** The image point at the panel's middle, from 0 to 1 across and down. */
  cx: number;
  cy: number;
  /** Quarter turns clockwise. */
  turns: 0 | 1 | 2 | 3;
  flip: boolean;
}

export interface PanelImage {
  /** The image file, as a vault path. */
  path: string;
  crop: Crop;
  /** Micrometres per pixel, from the file or typed in; null if not known. */
  umPerPx: number | null;
}

/** How one channel is shown: values from `min` (black) to `max` (full), its colour, and whether it shows. */
export interface ChannelShow {
  min: number;
  max: number;
  colour: string;
  on: boolean;
}

/**
 * How images are shown, set for a whole group of panels at once so the
 * panels compared are treated alike: the whole figure, each row, or each
 * column. A group not set yet shows each channel from zero to the highest
 * value in the figure.
 */
export interface Display {
  scope: 'figure' | 'row' | 'col';
  /** By group: `all`, `r0`, `c2` and so on; then by channel. */
  groups: Record<string, ChannelShow[]>;
}

export interface ScaleBar {
  /** Length, µm. */
  um: number;
  corner: Corner;
  /** Thickness, mm. */
  thickness: number;
  colour: string;
  /** Write the length beside the bar. */
  text: boolean;
}

/** The group a panel's display settings come from. */
export function displayGroup(display: Display, panel: { row: number; col: number }): string {
  return display.scope === 'figure'
    ? 'all'
    : display.scope === 'row'
      ? `r${String(panel.row)}`
      : `c${String(panel.col)}`;
}

/** Colours channels start with, as fluorescence is usually shown. */
export const START_COLOURS = ['#3ddc5a', '#ff40ff', '#4a8cff', '#ff4040', '#30e0f0', '#ffe040'];

/** A word in a panel's corner, such as a channel or antibody, in its colour. */
export interface PanelLabel {
  text: string;
  colour: string;
}

export interface Panel {
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  image: PanelImage | null;
  labels: PanelLabel[];
  /** A scale bar in this panel. */
  scaleBar: boolean;
}

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Colours for channel labels, as microscopy usually shows them. */
export const CHANNEL_COLOURS = [
  { name: 'White', value: '#ffffff' },
  { name: 'Green', value: '#3ddc5a' },
  { name: 'Magenta', value: '#ff40ff' },
  { name: 'Red', value: '#ff4040' },
  { name: 'Blue', value: '#4a8cff' },
  { name: 'Cyan', value: '#30e0f0' },
  { name: 'Yellow', value: '#ffe040' },
] as const;

/** A label over several columns, above the column labels, such as "Control". */
export interface Header {
  id: string;
  text: string;
  col: number;
  span: number;
}

export interface LetterStyle {
  /** `A`, `a` or `(a)`. */
  form: 'upper' | 'lower' | 'brackets';
  corner: Corner;
  /** Size in points. */
  size: number;
  /** White on dark images, black on light. */
  colour: string;
  show: boolean;
}

export interface Figure {
  version: 1;
  /** Page width, mm. The height follows from the rows. */
  width: number;
  /** Space between panels, mm. */
  gap: number;
  /** Column widths, as shares of the room for columns. */
  cols: number[];
  /** Row heights, mm. */
  rows: number[];
  panels: Panel[];
  /** A label for each row, at the left, such as a genotype; empty for none. */
  rowLabels: string[];
  /** A label for each column, at the top, such as an antibody; empty for none. */
  colLabels: string[];
  headers: Header[];
  letters: LetterStyle;
  /** Label text size, points. */
  labelSize: number;
  /** Where panels' channel labels go, and their size in points. */
  channelCorner: Corner;
  channelSize: number;
  display: Display;
  scaleBar: ScaleBar;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where everything is on the page, in mm. */
export interface Layout {
  width: number;
  height: number;
  panels: (Box & { panel: Panel })[];
  rowLabels: (Box & { row: number })[];
  colLabels: (Box & { col: number })[];
  headers: (Box & { header: Header })[];
  /** The grid's own box, inside the label room. */
  grid: Box;
}

export function newId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export const DEFAULT_CROP: Crop = { zoom: 1, cx: 0.5, cy: 0.5, turns: 0, flip: false };

/** A figure with a grid of empty panels, one to a cell. */
export function newFigure(rows = 2, cols = 3, width = 174): Figure {
  const panelWidth = (width - 2 * (cols - 1)) / cols;
  const figure: Figure = {
    version: 1,
    width,
    gap: 2,
    cols: Array.from({ length: cols }, () => 1),
    rows: Array.from({ length: rows }, () => Math.round(panelWidth * 10) / 10),
    panels: [],
    rowLabels: Array.from({ length: rows }, () => ''),
    colLabels: Array.from({ length: cols }, () => ''),
    headers: [],
    letters: { form: 'upper', corner: 'top-left', size: 10, colour: '#ffffff', show: true },
    labelSize: 8,
    channelCorner: 'top-right',
    channelSize: 7,
    display: { scope: 'figure', groups: {} },
    scaleBar: { um: 20, corner: 'bottom-right', thickness: 0.6, colour: '#ffffff', text: false },
  };
  return fillCells(figure);
}

/** Every cell not covered by a panel gets an empty one, in reading order. */
export function fillCells(figure: Figure): Figure {
  const taken = new Set<string>();
  const kept = figure.panels.filter(
    (p) =>
      p.row >= 0 &&
      p.col >= 0 &&
      p.row + p.rowSpan <= figure.rows.length &&
      p.col + p.colSpan <= figure.cols.length,
  );
  for (const p of kept) {
    for (let r = p.row; r < p.row + p.rowSpan; r += 1) {
      for (let c = p.col; c < p.col + p.colSpan; c += 1) taken.add(`${String(r)},${String(c)}`);
    }
  }
  const added: Panel[] = [];
  for (let r = 0; r < figure.rows.length; r += 1) {
    for (let c = 0; c < figure.cols.length; c += 1) {
      if (!taken.has(`${String(r)},${String(c)}`)) {
        added.push({
          id: newId(),
          row: r,
          col: c,
          rowSpan: 1,
          colSpan: 1,
          image: null,
          labels: [],
          scaleBar: false,
        });
      }
    }
  }
  return { ...figure, panels: inReadingOrder([...kept, ...added]) };
}

export function inReadingOrder(panels: readonly Panel[]): Panel[] {
  return [...panels].sort((a, b) => a.row - b.row || a.col - b.col);
}

const POINT = 25.4 / 72;

/** Room the labels take, mm: a label's text height and a little space. */
function labelRoom(figure: Figure): { left: number; top: number; header: number } {
  const line = figure.labelSize * POINT * 1.35;
  const left = figure.rowLabels.some((l) => l.trim() !== '') ? line * 1.6 : 0;
  const top = figure.colLabels.some((l) => l.trim() !== '') ? line * 1.6 : 0;
  const header = figure.headers.some((h) => h.text.trim() !== '') ? line * 1.8 : 0;
  return { left, top, header };
}

/** Where everything goes on the page. */
export function layout(figure: Figure): Layout {
  const room = labelRoom(figure);
  const gridX = room.left;
  const gridY = room.header + room.top;
  const gridW = Math.max(10, figure.width - gridX);
  const gaps = figure.gap * Math.max(0, figure.cols.length - 1);
  const total = figure.cols.reduce((s, w) => s + w, 0) || 1;
  const colW = figure.cols.map((w) => (Math.max(0, gridW - gaps) * w) / total);
  const colX: number[] = [];
  let x = gridX;
  for (const w of colW) {
    colX.push(x);
    x += w + figure.gap;
  }
  const rowY: number[] = [];
  let y = gridY;
  for (const h of figure.rows) {
    rowY.push(y);
    y += h + figure.gap;
  }
  const gridH = Math.max(0, y - figure.gap - gridY);
  const span = (start: number[], size: number[], from: number, n: number) => {
    const a = start[from] ?? 0;
    const lastIndex = Math.min(from + n, size.length) - 1;
    return (start[lastIndex] ?? a) + (size[lastIndex] ?? 0) - a;
  };
  return {
    width: figure.width,
    height: gridY + gridH,
    grid: { x: gridX, y: gridY, w: gridW, h: gridH },
    panels: figure.panels.map((panel) => ({
      panel,
      x: colX[panel.col] ?? 0,
      y: rowY[panel.row] ?? 0,
      w: span(colX, colW, panel.col, panel.colSpan),
      h: span(rowY, figure.rows, panel.row, panel.rowSpan),
    })),
    rowLabels: figure.rows.map((h, row) => ({ row, x: 0, y: rowY[row] ?? 0, w: room.left, h })),
    colLabels: colW.map((w, col) => ({
      col,
      x: colX[col] ?? 0,
      y: room.header,
      w,
      h: room.top,
    })),
    headers: figure.headers.map((header) => ({
      header,
      x: colX[header.col] ?? 0,
      y: 0,
      w: span(colX, colW, header.col, header.span),
      h: room.header,
    })),
  };
}

/** The panel at a page point (mm), or null. */
export function panelAt(l: Layout, x: number, y: number) {
  return l.panels.find((p) => x >= p.x && y >= p.y && x <= p.x + p.w && y <= p.y + p.h) ?? null;
}

/**
 * The part of an image a panel shows, in image pixels, for drawing it in a
 * box of a shape. With a quarter turn, the image's own width and height
 * swap places in the box. Zoom 1 fills the box without gaps.
 */
export function sourceRect(
  natural: { w: number; h: number },
  box: { w: number; h: number },
  crop: Crop,
): Box {
  const turned = crop.turns % 2 === 1;
  // The box's shape, in the image's own (unturned) frame.
  const bw = turned ? box.h : box.w;
  const bh = turned ? box.w : box.h;
  const scale = Math.max(bw / natural.w, bh / natural.h) * Math.max(1, crop.zoom);
  const w = Math.min(natural.w, bw / scale);
  const h = Math.min(natural.h, bh / scale);
  const x = Math.min(natural.w - w, Math.max(0, crop.cx * natural.w - w / 2));
  const y = Math.min(natural.h - h, Math.max(0, crop.cy * natural.h - h / 2));
  return { x, y, w, h };
}

/** A crop moved by a drag across the panel, in shares of the panel's size. */
export function panned(
  crop: Crop,
  dxShare: number,
  dyShare: number,
  view: Box,
  natural: { w: number; h: number },
): Crop {
  // Undo the turn and flip, so the image follows the finger.
  let dx = -dxShare,
    dy = -dyShare;
  for (let i = 0; i < crop.turns; i += 1) [dx, dy] = [dy, -dx];
  if (crop.flip) dx = -dx;
  const cx = crop.cx + (dx * view.w) / natural.w;
  const cy = crop.cy + (dy * view.h) / natural.h;
  const halfW = view.w / natural.w / 2,
    halfH = view.h / natural.h / 2;
  return {
    ...crop,
    cx: Math.min(1 - halfW, Math.max(halfW, cx)),
    cy: Math.min(1 - halfH, Math.max(halfH, cy)),
  };
}

/** A panel's letter: 0 is A, a or (a). */
export function letter(index: number, form: LetterStyle['form']): string {
  let n = index;
  let text = '';
  do {
    text = String.fromCharCode(97 + (n % 26)) + text;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return form === 'upper' ? text.toUpperCase() : form === 'brackets' ? `(${text})` : text;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const colourOr = (v: unknown, fallback: string) =>
  typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
const CORNERS: readonly Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const corner = (v: unknown, fallback: Corner): Corner => CORNERS.find((c) => c === v) ?? fallback;

function parseDisplay(raw: unknown): Display {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const scope = r['scope'] === 'row' || r['scope'] === 'col' ? r['scope'] : 'figure';
  const groups: Display['groups'] = {};
  const given = r['groups'];
  if (given && typeof given === 'object') {
    for (const [key, list] of Object.entries(given as Record<string, unknown>)) {
      if (!/^(all|[rc]\d+)$/.test(key) || !Array.isArray(list)) continue;
      groups[key] = (list as unknown[]).slice(0, 8).map((x, i) => {
        const c = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
        const min = num(c['min']) ? Math.max(0, c['min']) : 0;
        const max = num(c['max']) ? Math.max(min + 1e-6, c['max']) : 255;
        return {
          min,
          max,
          colour: colourOr(c['colour'], START_COLOURS[i] ?? '#ffffff'),
          on: c['on'] !== false,
        };
      });
    }
  }
  return { scope, groups };
}

function parseScaleBar(raw: unknown, base: ScaleBar): ScaleBar {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    um: num(r['um']) ? clamp(r['um'], 0.01, 100000) : base.um,
    corner: corner(r['corner'], base.corner),
    thickness: num(r['thickness']) ? clamp(r['thickness'], 0.1, 5) : base.thickness,
    colour: colourOr(r['colour'], base.colour),
    text: r['text'] === true,
  };
}

function parseCrop(raw: unknown): Crop {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const turns = num(r['turns']) ? ((((Math.round(r['turns']) % 4) + 4) % 4) as Crop['turns']) : 0;
  return {
    zoom: num(r['zoom']) ? clamp(r['zoom'], 1, 40) : 1,
    cx: num(r['cx']) ? clamp(r['cx'], 0, 1) : 0.5,
    cy: num(r['cy']) ? clamp(r['cy'], 0, 1) : 0.5,
    turns,
    flip: r['flip'] === true,
  };
}

/** Reads a figure's text; null if it is not a figure. Odd values fall back. */
export function parseFigure(text: string): Figure | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r['rows']) || !Array.isArray(r['cols'])) return null;
  const base = newFigure(1, 1);
  const rows = (r['rows'] as unknown[])
    .filter(num)
    .map((h) => clamp(h, 5, 400))
    .slice(0, 30);
  const cols = (r['cols'] as unknown[])
    .filter(num)
    .map((w) => clamp(w, 0.05, 20))
    .slice(0, 30);
  if (rows.length === 0 || cols.length === 0) return null;
  const strings = (v: unknown, n: number) =>
    Array.from({ length: n }, (_x, i) => {
      const s = Array.isArray(v) ? (v as unknown[])[i] : undefined;
      return typeof s === 'string' ? s : '';
    });
  const panels = (Array.isArray(r['panels']) ? (r['panels'] as unknown[]) : [])
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p): Panel => {
      const image = p['image'] as Record<string, unknown> | null | undefined;
      return {
        id: typeof p['id'] === 'string' ? p['id'] : newId(),
        row: num(p['row']) ? Math.floor(p['row']) : -1,
        col: num(p['col']) ? Math.floor(p['col']) : -1,
        rowSpan: num(p['rowSpan']) ? Math.max(1, Math.floor(p['rowSpan'])) : 1,
        colSpan: num(p['colSpan']) ? Math.max(1, Math.floor(p['colSpan'])) : 1,
        image:
          image && typeof image === 'object' && typeof image['path'] === 'string'
            ? {
                path: image['path'],
                crop: parseCrop(image['crop']),
                umPerPx: num(image['umPerPx']) && image['umPerPx'] > 0 ? image['umPerPx'] : null,
              }
            : null,
        labels: (Array.isArray(p['labels']) ? (p['labels'] as unknown[]) : [])
          .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
          .filter((x) => typeof x['text'] === 'string')
          .map((x) => ({ text: x['text'] as string, colour: colourOr(x['colour'], '#ffffff') }))
          .slice(0, 8),
        scaleBar: p['scaleBar'] === true,
      };
    });
  const l = (r['letters'] ?? {}) as Record<string, unknown>;
  const figure: Figure = {
    version: 1,
    width: num(r['width']) ? clamp(r['width'], 20, 600) : base.width,
    gap: num(r['gap']) ? clamp(r['gap'], 0, 20) : base.gap,
    cols,
    rows,
    panels,
    rowLabels: strings(r['rowLabels'], rows.length),
    colLabels: strings(r['colLabels'], cols.length),
    headers: (Array.isArray(r['headers']) ? (r['headers'] as unknown[]) : [])
      .filter((h): h is Record<string, unknown> => !!h && typeof h === 'object')
      .filter((h) => typeof h['text'] === 'string' && num(h['col']) && num(h['span']))
      .map((h) => ({
        id: typeof h['id'] === 'string' ? h['id'] : newId(),
        text: h['text'] as string,
        col: clamp(Math.floor(h['col'] as number), 0, cols.length - 1),
        span: clamp(Math.floor(h['span'] as number), 1, cols.length),
      })),
    letters: {
      form: l['form'] === 'lower' || l['form'] === 'brackets' ? l['form'] : 'upper',
      corner: corner(l['corner'], 'top-left'),
      size: num(l['size']) ? clamp(l['size'], 4, 36) : 10,
      colour: colourOr(l['colour'], '#ffffff'),
      show: l['show'] !== false,
    },
    labelSize: num(r['labelSize']) ? clamp(r['labelSize'], 4, 24) : base.labelSize,
    channelCorner: corner(r['channelCorner'], 'top-right'),
    channelSize: num(r['channelSize']) ? clamp(r['channelSize'], 4, 24) : base.channelSize,
    display: parseDisplay(r['display']),
    scaleBar: parseScaleBar(r['scaleBar'], base.scaleBar),
  };
  return fillCells(figure);
}

export function serialiseFigure(figure: Figure): string {
  return `${JSON.stringify(figure, (_k, v: unknown) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v), 1)}\n`;
}

// ---- Changing the grid ----

/** Adds a row or column after `index`, with empty panels in it; panels that span it grow. */
export function insertLine(figure: Figure, axis: 'row' | 'col', index: number): Figure {
  const at = index + 1;
  const panels = figure.panels.map((p) => {
    const start = axis === 'row' ? p.row : p.col;
    const span = axis === 'row' ? p.rowSpan : p.colSpan;
    if (start >= at) return axis === 'row' ? { ...p, row: p.row + 1 } : { ...p, col: p.col + 1 };
    if (start + span > at) {
      return axis === 'row' ? { ...p, rowSpan: p.rowSpan + 1 } : { ...p, colSpan: p.colSpan + 1 };
    }
    return p;
  });
  const next =
    axis === 'row'
      ? {
          ...figure,
          rows: [
            ...figure.rows.slice(0, at),
            figure.rows[index] ?? figure.rows.at(-1) ?? 40,
            ...figure.rows.slice(at),
          ],
          rowLabels: [...figure.rowLabels.slice(0, at), '', ...figure.rowLabels.slice(at)],
          panels,
        }
      : {
          ...figure,
          cols: [...figure.cols.slice(0, at), figure.cols[index] ?? 1, ...figure.cols.slice(at)],
          colLabels: [...figure.colLabels.slice(0, at), '', ...figure.colLabels.slice(at)],
          headers: figure.headers.map((h) =>
            h.col >= at
              ? { ...h, col: h.col + 1 }
              : h.col + h.span > at
                ? { ...h, span: h.span + 1 }
                : h,
          ),
          panels,
        };
  return fillCells(next);
}

/** Removes a row or column; panels only in it go, panels across it shrink. */
export function removeLine(figure: Figure, axis: 'row' | 'col', index: number): Figure {
  if ((axis === 'row' ? figure.rows : figure.cols).length <= 1) return figure;
  const panels = figure.panels.flatMap((p) => {
    const start = axis === 'row' ? p.row : p.col;
    const span = axis === 'row' ? p.rowSpan : p.colSpan;
    if (start > index)
      return [axis === 'row' ? { ...p, row: p.row - 1 } : { ...p, col: p.col - 1 }];
    if (start + span <= index) return [p];
    if (span === 1) return [];
    return [axis === 'row' ? { ...p, rowSpan: p.rowSpan - 1 } : { ...p, colSpan: p.colSpan - 1 }];
  });
  const next =
    axis === 'row'
      ? {
          ...figure,
          rows: figure.rows.filter((_r, i) => i !== index),
          rowLabels: figure.rowLabels.filter((_r, i) => i !== index),
          panels,
        }
      : {
          ...figure,
          cols: figure.cols.filter((_c, i) => i !== index),
          colLabels: figure.colLabels.filter((_c, i) => i !== index),
          headers: figure.headers.flatMap((h) =>
            h.col > index
              ? [{ ...h, col: h.col - 1 }]
              : h.col + h.span <= index
                ? [h]
                : h.span === 1
                  ? []
                  : [{ ...h, span: h.span - 1 }],
          ),
          panels,
        };
  return fillCells(next);
}

/**
 * Joins the panels in a block of cells into one, keeping the first image.
 * Null if the block would cut through a panel that reaches outside it.
 */
export function merge(
  figure: Figure,
  block: { row: number; col: number; rowSpan: number; colSpan: number },
): Figure | null {
  const inside = (p: Panel) =>
    p.row >= block.row &&
    p.col >= block.col &&
    p.row + p.rowSpan <= block.row + block.rowSpan &&
    p.col + p.colSpan <= block.col + block.colSpan;
  const overlaps = (p: Panel) =>
    p.row < block.row + block.rowSpan &&
    p.row + p.rowSpan > block.row &&
    p.col < block.col + block.colSpan &&
    p.col + p.colSpan > block.col;
  const touched = figure.panels.filter(overlaps);
  if (touched.some((p) => !inside(p))) return null;
  const first = inReadingOrder(touched).find((p) => p.image !== null) ?? touched[0];
  const joined: Panel = {
    id: first?.id ?? newId(),
    ...block,
    image: first?.image ?? null,
    labels: first?.labels ?? [],
    scaleBar: first?.scaleBar ?? false,
  };
  return fillCells({ ...figure, panels: [...figure.panels.filter((p) => !overlaps(p)), joined] });
}

/** Splits a panel back into one per cell; its image stays in the first. */
export function split(figure: Figure, id: string): Figure {
  const panel = figure.panels.find((p) => p.id === id);
  if (!panel) return figure;
  const rest = figure.panels.filter((p) => p.id !== id);
  return fillCells({ ...figure, panels: [...rest, { ...panel, rowSpan: 1, colSpan: 1 }] });
}

/** Puts images into empty panels in reading order, from a starting panel. */
export function fillWith(figure: Figure, paths: readonly string[], fromId?: string): Figure {
  const order = inReadingOrder(figure.panels);
  const start =
    fromId === undefined
      ? 0
      : Math.max(
          0,
          order.findIndex((p) => p.id === fromId),
        );
  const queue = [...paths];
  const placed = new Map<string, string>();
  // The panel dropped on takes the first image, even if it had one.
  const first = fromId === undefined ? undefined : order[start];
  if (first && queue.length > 0) placed.set(first.id, queue.shift() ?? '');
  for (const p of [...order.slice(start), ...order.slice(0, start)]) {
    if (queue.length === 0) break;
    if (placed.has(p.id) || p.image !== null) continue;
    placed.set(p.id, queue.shift() ?? '');
  }
  return {
    ...figure,
    panels: figure.panels.map((p) => {
      const path = placed.get(p.id);
      return path === undefined
        ? p
        : { ...p, image: { path, crop: { ...DEFAULT_CROP }, umPerPx: null } };
    }),
  };
}
