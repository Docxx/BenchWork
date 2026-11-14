import { textWidth } from './measure';
import { newId, POINT, type Box } from './model';
import { parseRich } from './richText';
import type { Prim } from './scene';

/**
 * Labels round a blot: lanes across the image with their names above,
 * labels over groups of lanes, a table of conditions (+ and − by lane),
 * size markers down the left and band names down the right. The same kind
 * of table also stands alone, under a graph.
 */

/** A row of a conditions table: its name, then a value for each lane or column. */
export interface TableRow {
  id: string;
  label: string;
  cells: string[];
}

/** A label beside the image at a point down it, as a share of its height. */
export interface SideLabel {
  id: string;
  text: string;
  at: number;
}

export interface LaneGroup {
  id: string;
  text: string;
  start: number;
  span: number;
}

export const LANE_ANGLES = [0, 45, 90] as const;
export type LaneAngle = (typeof LANE_ANGLES)[number];

export interface Blot {
  lanes: number;
  /** Where the first lane starts and the last ends across the image, as shares. */
  from: number;
  to: number;
  laneLabels: string[];
  /** Lane names read across, or slant upwards. */
  laneAngle: LaneAngle;
  groups: LaneGroup[];
  rows: TableRow[];
  /** Sizes down the left, such as 62 kDa. */
  markers: SideLabel[];
  /** Band names down the right, such as GAPDH. */
  bands: SideLabel[];
}

/** A table standing alone: a name column, then evenly spaced columns. */
export interface Table {
  cols: number;
  rows: TableRow[];
  /** Points. */
  size: number;
}

export function newBlot(lanes = 4): Blot {
  return {
    lanes,
    from: 0,
    to: 1,
    laneLabels: Array.from({ length: lanes }, () => ''),
    laneAngle: 0,
    groups: [],
    rows: [],
    markers: [],
    bands: [],
  };
}

export function newTable(cols = 4): Table {
  return {
    cols,
    rows: [
      { id: newId(), label: 'Drug', cells: ['−', '+', '−', '+'].slice(0, cols) },
      { id: newId(), label: 'siRNA', cells: ['−', '−', '+', '+'].slice(0, cols) },
    ],
    size: 7,
  };
}

/** Lanes or columns changed in number: names and cells kept where they still fit. */
export function withLanes(blot: Blot, lanes: number): Blot {
  const fit = (list: readonly string[]) => Array.from({ length: lanes }, (_x, i) => list[i] ?? '');
  return {
    ...blot,
    lanes,
    laneLabels: fit(blot.laneLabels),
    rows: blot.rows.map((r) => ({ ...r, cells: fit(r.cells) })),
    groups: blot.groups
      .filter((g) => g.start < lanes)
      .map((g) => ({ ...g, span: Math.min(g.span, lanes - g.start) })),
  };
}

export function withCols(table: Table, cols: number): Table {
  return {
    ...table,
    cols,
    rows: table.rows.map((r) => ({
      ...r,
      cells: Array.from({ length: cols }, (_x, i) => r.cells[i] ?? ''),
    })),
  };
}

const widest = (texts: readonly string[], size: number) =>
  Math.max(0, ...texts.filter((t) => t.trim() !== '').map((t) => textWidth(parseRich(t), size)));

export interface BlotLayout {
  /** Where the image goes. */
  image: Box;
  /** Each lane's middle, across. */
  lanes: number[];
  laneWidth: number;
  groupsY: number;
  labelsY: number;
  /** The bottom of the lane names: slanted names start here. */
  labelsBottom: number;
  rowsY: number;
  line: number;
}

/** The room a blot's labels take above the image, mm, at a text size in mm. */
export function blotTop(blot: Blot, size: number): number {
  const line = size * 1.35;
  const names = blot.laneLabels.filter((t) => t.trim() !== '');
  const longest = widest(names, size);
  const labels =
    names.length === 0
      ? 0
      : blot.laneAngle === 0
        ? line
        : blot.laneAngle === 45
          ? longest * Math.SQRT1_2 + line * 0.8
          : longest + size * 0.6;
  const groups = blot.groups.some((g) => g.text.trim() !== '') ? line * 1.5 : 0;
  return groups + labels + blot.rows.length * line + (blot.rows.length > 0 ? size * 0.3 : 0);
}

export function blotLayout(blot: Blot, box: Box, size: number): BlotLayout {
  const line = size * 1.35;
  const pad = size * 0.6;
  const leftTexts = [...blot.markers.map((m) => m.text), ...blot.rows.map((r) => r.label)];
  const left = leftTexts.some((t) => t.trim() !== '') ? widest(leftTexts, size) + pad * 2 : 0;
  const right = blot.bands.some((b) => b.text.trim() !== '')
    ? widest(
        blot.bands.map((b) => b.text),
        size,
      ) +
      pad * 2
    : 0;
  const top = blotTop(blot, size);
  const groupsH = blot.groups.some((g) => g.text.trim() !== '') ? line * 1.5 : 0;
  const image = {
    x: box.x + left,
    y: box.y + top,
    w: Math.max(2, box.w - left - right),
    h: Math.max(2, box.h - top),
  };
  const n = Math.max(1, blot.lanes);
  const laneWidth = (image.w * (blot.to - blot.from)) / n;
  const rowsH = blot.rows.length * line + (blot.rows.length > 0 ? size * 0.3 : 0);
  return {
    image,
    lanes: Array.from(
      { length: n },
      (_x, i) => image.x + image.w * blot.from + laneWidth * (i + 0.5),
    ),
    laneWidth,
    groupsY: box.y,
    labelsY: box.y + groupsH,
    labelsBottom: image.y - rowsH,
    rowsY: image.y - rowsH,
    line,
  };
}

/** Rows of a table: names at `nameX` (right-aligned to it, or from it), values centred at `xs`. */
function rowPrims(
  rows: readonly TableRow[],
  nameX: number,
  nameAlign: 'left' | 'right',
  xs: readonly number[],
  top: number,
  line: number,
  size: number,
): Prim[] {
  const prims: Prim[] = [];
  rows.forEach((row, i) => {
    const y = top + line * (i + 0.5);
    if (row.label.trim() !== '') {
      prims.push({
        kind: 'text',
        runs: parseRich(row.label),
        x: nameX,
        y,
        size,
        colour: '#000000',
        align: nameAlign,
      });
    }
    xs.forEach((x, c) => {
      const cell = row.cells[c] ?? '';
      if (cell.trim() === '') return;
      prims.push({
        kind: 'text',
        runs: parseRich(cell),
        x,
        y,
        size,
        colour: '#000000',
        align: 'center',
      });
    });
  });
  return prims;
}

/** What a blot's labels draw, round its image. */
export function blotPrims(blot: Blot, l: BlotLayout, size: number): Prim[] {
  const prims: Prim[] = [];
  const half = l.laneWidth / 2;
  for (const g of blot.groups) {
    if (g.text.trim() === '') continue;
    const a = (l.lanes[g.start] ?? 0) - half;
    const b = (l.lanes[Math.min(g.start + g.span, blot.lanes) - 1] ?? a) + half;
    prims.push({
      kind: 'text',
      runs: parseRich(g.text),
      x: (a + b) / 2,
      y: l.groupsY + l.line * 0.5,
      size,
      colour: '#000000',
      align: 'center',
    });
    const y = l.groupsY + l.line * 1.15;
    prims.push({
      kind: 'line',
      from: [a + 0.4, y],
      to: [b - 0.4, y],
      stroke: '#000000',
      width: 0.25,
    });
  }
  l.lanes.forEach((x, i) => {
    const text = blot.laneLabels[i] ?? '';
    if (text.trim() === '') return;
    prims.push(
      blot.laneAngle === 0
        ? {
            kind: 'text',
            runs: parseRich(text),
            x,
            y: l.labelsY + l.line * 0.5,
            size,
            colour: '#000000',
            align: 'center',
          }
        : {
            kind: 'text',
            runs: parseRich(text),
            x: x - (blot.laneAngle === 45 ? size * 0.25 : 0),
            y: l.labelsBottom - size * 0.35,
            size,
            colour: '#000000',
            align: 'left',
            rotate: blot.laneAngle,
          },
    );
  });
  const pad = size * 0.6;
  prims.push(...rowPrims(blot.rows, l.image.x - pad, 'right', l.lanes, l.rowsY, l.line, size));
  for (const m of blot.markers) {
    if (m.text.trim() === '') continue;
    const y = l.image.y + m.at * l.image.h;
    prims.push(
      {
        kind: 'text',
        runs: parseRich(m.text),
        x: l.image.x - pad,
        y,
        size,
        colour: '#000000',
        align: 'right',
      },
      {
        kind: 'line',
        from: [l.image.x - pad * 0.8, y],
        to: [l.image.x, y],
        stroke: '#000000',
        width: 0.25,
      },
    );
  }
  for (const b of blot.bands) {
    if (b.text.trim() === '') continue;
    const y = l.image.y + b.at * l.image.h;
    const right = l.image.x + l.image.w;
    prims.push({
      kind: 'text',
      runs: parseRich(b.text),
      x: right + pad,
      y,
      size,
      colour: '#000000',
      align: 'left',
    });
  }
  return prims;
}

/** The table's columns: a name column as wide as its longest name, then the rest shared. */
export function tableLayout(table: Table, box: Box) {
  const size = table.size * POINT;
  const line = size * 1.35;
  const names = table.rows.map((r) => r.label);
  const nameW = names.some((t) => t.trim() !== '') ? widest(names, size) + size * 0.8 : 0;
  const n = Math.max(1, table.cols);
  const colW = Math.max(0.5, box.w - nameW) / n;
  return {
    size,
    line,
    nameW,
    cols: Array.from({ length: n }, (_x, i) => box.x + nameW + colW * (i + 0.5)),
  };
}

export function tablePrims(table: Table, box: Box): Prim[] {
  const l = tableLayout(table, box);
  return rowPrims(table.rows, box.x, 'left', l.cols, box.y, l.line, l.size);
}

/** How tall a table is, mm, for its rows. */
export function tableHeight(table: Table): number {
  const size = table.size * POINT;
  return Math.max(1, table.rows.length) * size * 1.35 + size * 0.2;
}

// ---- Reading ----

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const list = (v: unknown) =>
  (Array.isArray(v) ? (v as unknown[]) : []).filter(
    (x): x is Record<string, unknown> => !!x && typeof x === 'object',
  );

function parseRows(v: unknown, cols: number): TableRow[] {
  return list(v)
    .slice(0, 20)
    .map((r) => ({
      id: typeof r['id'] === 'string' ? r['id'] : newId(),
      label: str(r['label']),
      cells: Array.from({ length: cols }, (_x, i) =>
        str(Array.isArray(r['cells']) ? (r['cells'] as unknown[])[i] : ''),
      ),
    }));
}

function parseSide(v: unknown): SideLabel[] {
  return list(v)
    .slice(0, 30)
    .map((m) => ({
      id: typeof m['id'] === 'string' ? m['id'] : newId(),
      text: str(m['text']),
      at: num(m['at']) ? clamp(m['at'], 0, 1) : 0.5,
    }));
}

export function parseBlot(raw: unknown): Blot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const lanes = num(r['lanes']) ? clamp(Math.round(r['lanes']), 1, 40) : 4;
  const from = num(r['from']) ? clamp(r['from'], 0, 0.9) : 0;
  return {
    lanes,
    from,
    to: num(r['to']) ? clamp(r['to'], from + 0.05, 1) : 1,
    laneLabels: Array.from({ length: lanes }, (_x, i) =>
      str(Array.isArray(r['laneLabels']) ? (r['laneLabels'] as unknown[])[i] : ''),
    ),
    laneAngle: LANE_ANGLES.find((a) => a === r['laneAngle']) ?? 0,
    groups: list(r['groups'])
      .filter((g) => num(g['start']) && num(g['span']))
      .map((g) => {
        const start = clamp(Math.floor(g['start'] as number), 0, lanes - 1);
        return {
          id: typeof g['id'] === 'string' ? g['id'] : newId(),
          text: str(g['text']),
          start,
          span: clamp(Math.floor(g['span'] as number), 1, lanes - start),
        };
      }),
    rows: parseRows(r['rows'], lanes),
    markers: parseSide(r['markers']),
    bands: parseSide(r['bands']),
  };
}

export function parseTable(raw: unknown): Table {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const cols = num(r['cols']) ? clamp(Math.round(r['cols']), 1, 40) : 4;
  return {
    cols,
    rows: parseRows(r['rows'], cols),
    size: num(r['size']) ? clamp(r['size'], 4, 24) : 7,
  };
}
