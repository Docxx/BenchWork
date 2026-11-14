import { textWidth } from './measure';
import { newId, POINT, type Box } from './model';
import { parseRich, type Run } from './richText';
import type { Prim } from './scene';

/**
 * A graph drawn from data typed or pasted in: bars with error bars and
 * each value shown, lines through means, or points. The data is laid out
 * as in a spreadsheet: groups along the bottom, and for each group one or
 * more series, each with its replicate values. Significance is marked by
 * brackets with stars or P values, typed in.
 */

export const CHART_TYPES = ['bar', 'line', 'scatter'] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const ERROR_KINDS = ['sem', 'sd', 'none'] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];

export const LEGEND_PLACES = ['none', 'top', 'right', 'inside'] as const;
export type LegendPlace = (typeof LEGEND_PLACES)[number];

export interface Series {
  id: string;
  name: string;
  colour: string;
  /** For each group, its replicate values. */
  values: number[][];
}

/** A bracket between two bars or groups, with its stars or P value above. */
export interface Bracket {
  id: string;
  /** Bars counted along the bottom, group by group, from 0. */
  from: number;
  to: number;
  text: string;
}

export interface Chart {
  type: ChartType;
  /** The groups along the bottom; numbers, for a line or scatter, place points by value. */
  groups: string[];
  series: Series[];
  error: ErrorKind;
  /** Each value shown as a dot. */
  dots: boolean;
  xLabel: string;
  yLabel: string;
  /** Fixed ends for the value axis; null to fit the data. */
  yMin: number | null;
  yMax: number | null;
  yLog: boolean;
  xLog: boolean;
  /** Group names read across, or slanted. */
  slant: boolean;
  legend: LegendPlace;
  brackets: Bracket[];
  /** Text size, points. */
  size: number;
}

/** Colours that stay apart for colour-blind readers, and in grey. */
export const SERIES_COLOURS = [
  '#4d4d4d',
  '#e69f00',
  '#56b4e9',
  '#009e73',
  '#d55e00',
  '#0072b2',
  '#cc79a7',
  '#f0e442',
];

export function newChart(): Chart {
  return {
    type: 'bar',
    groups: ['Control', 'Treated'],
    series: [
      {
        id: newId(),
        name: 'Values',
        colour: '#ffffff',
        values: [
          [1, 1.12, 0.91, 0.97],
          [1.84, 2.1, 1.66, 1.95],
        ],
      },
    ],
    error: 'sem',
    dots: true,
    xLabel: '',
    yLabel: 'Relative level',
    yMin: null,
    yMax: null,
    yLog: false,
    xLog: false,
    slant: false,
    legend: 'top',
    brackets: [],
    size: 7,
  };
}

// ---- Numbers ----

export function mean(values: readonly number[]): number {
  return values.length === 0 ? NaN : values.reduce((s, v) => s + v, 0) / values.length;
}

export function sd(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

export function spread(values: readonly number[], kind: ErrorKind): number {
  if (kind === 'none' || values.length < 2) return 0;
  return kind === 'sd' ? sd(values) : sd(values) / Math.sqrt(values.length);
}

/** About `count` round numbers spanning lo to hi, starting and ending on one. */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (hi <= lo) hi = lo + (lo === 0 ? 1 : Math.abs(lo));
  const raw = (hi - lo) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * power >= raw) ?? 10) * power;
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return ticks.map((v) => Number(v.toPrecision(12)));
}

/** Powers of ten spanning lo to hi, for a log axis. */
export function logTicks(lo: number, hi: number): number[] {
  const a = Math.floor(Math.log10(Math.max(lo, 1e-12)));
  const b = Math.ceil(Math.log10(Math.max(hi, lo * 10, 1e-12)));
  return Array.from({ length: Math.max(2, b - a + 1) }, (_x, i) => 10 ** (a + i));
}

/** A tick label: short, without trailing noughts. */
export function tickText(v: number): string {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e5 || abs < 1e-3) return v.toExponential(0).replace('e+', 'e');
  return String(Number(v.toPrecision(4)));
}

// ---- Data in and out ----

const cellsOf = (line: string) =>
  line.includes('\t') ? line.split('\t') : line.includes(',') ? line.split(',') : line.split(/\s+/);

const toNumber = (cell: string) => {
  const t = cell.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Data pasted from a spreadsheet. Two layouts are understood:
 * - groups across the top, one value per row below each (one series);
 * - an empty first cell, series names across the top (a name repeated
 *   for each replicate), and a group's name then its values on each row.
 * Series keep their colours from `before` where the names match.
 */
export function parseData(
  text: string,
  before: readonly Series[] = [],
): { groups: string[]; series: Series[] } | null {
  const rows = text
    .replace(/\r/g, '')
    .split('\n')
    .map(cellsOf)
    .filter((r) => r.some((c) => c.trim() !== ''));
  const head = rows[0];
  if (!head || rows.length < 2) return null;
  const colourFor = (name: string, i: number) =>
    before.find((s) => s.name === name)?.colour ??
    before[i]?.colour ??
    (i === 0 ? '#ffffff' : (SERIES_COLOURS[i % SERIES_COLOURS.length] ?? '#4d4d4d'));
  const idFor = (name: string, i: number) =>
    before.find((s) => s.name === name)?.id ?? before[i]?.id ?? newId();

  if (head[0]?.trim() !== '') {
    // Groups across, values down.
    const groups = head.map((c) => c.trim());
    const values = groups.map((_g, c) =>
      rows.slice(1).flatMap((r) => {
        const n = toNumber(r[c] ?? '');
        return n === null ? [] : [n];
      }),
    );
    const name = before[0]?.name ?? 'Values';
    return { groups, series: [{ id: idFor(name, 0), name, colour: colourFor(name, 0), values }] };
  }

  // Series across (repeated for replicates), groups down.
  const names: string[] = [];
  const columnOf: number[] = [];
  head.slice(1).forEach((c) => {
    const name = c.trim() || `Series ${String(names.length + 1)}`;
    let at = names.indexOf(name);
    if (at < 0) {
      names.push(name);
      at = names.length - 1;
    }
    columnOf.push(at);
  });
  const body = rows.slice(1);
  const groups = body.map((r, i) => r[0]?.trim() || String(i + 1));
  const series = names.map((name, s): Series => ({
    id: idFor(name, s),
    name,
    colour: colourFor(name, s),
    values: body.map((r) =>
      r.slice(1).flatMap((cell, c) => {
        const n = columnOf[c] === s ? toNumber(cell) : null;
        return n === null ? [] : [n];
      }),
    ),
  }));
  return { groups, series };
}

/** The data as text to edit, in the layout it would be pasted in. */
export function formatData(chart: Pick<Chart, 'groups' | 'series'>): string {
  const [only] = chart.series;
  if (chart.series.length === 1 && only) {
    const longest = Math.max(0, ...only.values.map((v) => v.length));
    const lines = [chart.groups.join('\t')];
    for (let r = 0; r < longest; r += 1)
      lines.push(chart.groups.map((_g, c) => String(only.values[c]?.[r] ?? '')).join('\t'));
    return lines.join('\n');
  }
  const reps = chart.series.map((s) => Math.max(1, ...s.values.map((v) => v.length)));
  const head = [''];
  chart.series.forEach((s, i) => {
    for (let r = 0; r < (reps[i] ?? 1); r += 1) head.push(s.name);
  });
  const lines = [head.join('\t')];
  chart.groups.forEach((g, c) => {
    const row = [g];
    chart.series.forEach((s, i) => {
      for (let r = 0; r < (reps[i] ?? 1); r += 1) row.push(String(s.values[c]?.[r] ?? ''));
    });
    lines.push(row.join('\t'));
  });
  return lines.join('\n');
}

/** A name for each bar along the bottom, for choosing where a bracket goes. */
export function barNames(chart: Chart): string[] {
  if (chart.type !== 'bar' || chart.series.length < 2) return [...chart.groups];
  return chart.groups.flatMap((g) => chart.series.map((s) => `${g}, ${s.name}`));
}

// ---- Laying out and drawing ----

interface Mark {
  /** Middle across, mm. */
  x: number;
  /** The value shown and its error. */
  value: number;
  error: number;
  /** The highest point drawn for it, as a value. */
  top: number;
}

export interface ChartLayout {
  plot: Box;
  y: (v: number) => number;
  yTicks: number[];
  /** Each group's middle across, mm. */
  groupX: number[];
  /** Bars, or points per group for lines: by series, then group. */
  marks: Mark[][];
  barWidth: number;
  size: number;
  line: number;
}

const finite = (v: number) => Number.isFinite(v);

export function chartLayout(chart: Chart, box: Box): ChartLayout {
  const size = chart.size * POINT;
  const line = size * 1.3;
  const tick = size * 0.45;
  const nGroups = Math.max(1, chart.groups.length);
  const nSeries = Math.max(1, chart.series.length);

  // The value range: means with their errors, and each value if shown.
  const tops: number[] = [];
  const bottoms: number[] = [];
  for (const s of chart.series) {
    for (const v of s.values) {
      if (v.length === 0) continue;
      const m = mean(v);
      const e = spread(v, chart.error);
      tops.push(m + e);
      bottoms.push(m - (chart.type === 'bar' ? 0 : e));
      if (chart.dots || chart.type === 'scatter') {
        tops.push(Math.max(...v));
        bottoms.push(Math.min(...v));
      }
    }
  }
  let lo = bottoms.length > 0 ? Math.min(...bottoms) : 0;
  let hi = tops.length > 0 ? Math.max(...tops) : 1;
  if (chart.type === 'bar' && !chart.yLog) lo = Math.min(0, lo);
  if (chart.yMin !== null) lo = chart.yMin;
  if (chart.yMax !== null) hi = chart.yMax;
  const yTicks = chart.yLog ? logTicks(Math.max(lo, 1e-9), Math.max(hi, 1e-9)) : niceTicks(lo, hi);
  const y0 = chart.yMin ?? yTicks[0] ?? lo;
  const y1 = chart.yMax ?? yTicks.at(-1) ?? hi;
  const shownTicks = yTicks.filter((t) => t >= y0 - 1e-9 && t <= y1 + 1e-9);

  // Margins: tick labels and the axis name at left; group names and the axis name below.
  const tickW = Math.max(0, ...shownTicks.map((t) => textWidth(runsOf(tickText(t)), size)));
  const left = tickW + tick + size * 0.5 + (chart.yLabel.trim() !== '' ? line * 1.15 : 0);
  const groupW = Math.max(0, ...chart.groups.map((g) => textWidth(parseRich(g), size)));
  const numericX =
    chart.type !== 'bar' && chart.groups.every((g) => finite(Number(g)) && g.trim() !== '');
  const below =
    (chart.slant && !numericX ? groupW * Math.SQRT1_2 + size * 0.7 : line) +
    tick +
    (chart.xLabel.trim() !== '' ? line * 1.1 : 0);
  const named = chart.series.length > 1 && chart.legend !== 'none';
  const legendW = named
    ? Math.max(...chart.series.map((s) => textWidth(parseRich(s.name), size))) + size * 2.4
    : 0;
  const right = named && chart.legend === 'right' ? legendW + size * 0.5 : size * 0.6;
  const levels = bracketLevels(chart);
  const top =
    size * 0.6 + levels * line * 1.35 + (named && chart.legend === 'top' ? line * 1.2 : 0);
  const plot = {
    x: box.x + left,
    y: box.y + top,
    w: Math.max(4, box.w - left - right),
    h: Math.max(4, box.h - top - below),
  };
  const scaleY = (v: number) => (chart.yLog ? Math.log10(Math.max(v, 1e-12)) : v);
  const a = scaleY(y0);
  const b = scaleY(y1);
  const y = (v: number) => plot.y + plot.h - ((scaleY(v) - a) / (b - a || 1)) * plot.h;

  // Across: groups evenly spaced, or by value for numbers on a line or scatter.
  const xs = chart.groups.map(Number);
  const xLo = Math.min(...xs);
  const xHi = Math.max(...xs);
  const toX = (v: number) => {
    const sx = (n: number) => (chart.xLog ? Math.log10(Math.max(n, 1e-12)) : n);
    const span = sx(xHi) - sx(xLo) || 1;
    return plot.x + plot.w * 0.05 + ((sx(v) - sx(xLo)) / span) * plot.w * 0.9;
  };
  const slot = plot.w / nGroups;
  const groupX = chart.groups.map((_g, i) =>
    numericX ? toX(xs[i] ?? 0) : plot.x + slot * (i + 0.5),
  );
  const barWidth = chart.type === 'bar' ? (slot * 0.72) / nSeries : 0;
  const marks = chart.series.map((s, si) =>
    chart.groups.map((_g, gi): Mark => {
      const v = s.values[gi] ?? [];
      const m = mean(v);
      const e = spread(v, chart.error);
      const across =
        chart.type === 'bar'
          ? (groupX[gi] ?? 0) - (barWidth * nSeries) / 2 + barWidth * (si + 0.5)
          : (groupX[gi] ?? 0);
      const shownTop = Math.max(
        m + e,
        chart.dots || chart.type === 'scatter' ? Math.max(...v) : -Infinity,
      );
      return { x: across, value: m, error: e, top: shownTop };
    }),
  );
  return { plot, y, yTicks: shownTicks, groupX, marks, barWidth, size, line };
}

/** How many brackets stack above each other at most. */
function bracketLevels(chart: Chart): number {
  return placeBrackets(chart.brackets).reduce((m, b) => Math.max(m, b.level + 1), 0);
}

/** Each bracket's level: wider ones go above the narrower ones they cover. */
function placeBrackets(brackets: readonly Bracket[]) {
  const sorted = [...brackets]
    .map((b) => ({ ...b, lo: Math.min(b.from, b.to), hi: Math.max(b.from, b.to) }))
    .sort((p, q) => p.hi - p.lo - (q.hi - q.lo));
  const placed: (Bracket & { lo: number; hi: number; level: number })[] = [];
  for (const b of sorted) {
    const under = placed.filter((p) => p.lo <= b.hi && p.hi >= b.lo);
    const level = under.reduce((m, p) => Math.max(m, p.level + 1), 0);
    placed.push({ ...b, level });
  }
  return placed;
}

const runsOf = (text: string): Run[] => [{ text, bold: false, italic: false, shift: 'none' }];

function circle(x: number, y: number, r: number, fill: string, stroke?: string): Prim {
  const n = 14;
  return {
    kind: 'poly',
    points: Array.from({ length: n }, (_x, i): [number, number] => [
      x + r * Math.cos((i / n) * Math.PI * 2),
      y + r * Math.sin((i / n) * Math.PI * 2),
    ]),
    fill,
    ...(stroke ? { stroke, width: r * 0.35 } : {}),
  };
}

/** Values spread a little across a bar so equal ones do not hide each other. */
function jitter(i: number, n: number, width: number): number {
  if (n <= 1) return 0;
  return (i / (n - 1) - 0.5) * width;
}

export function chartPrims(chart: Chart, box: Box): Prim[] {
  const l = chartLayout(chart, box);
  const { plot, size, line } = l;
  const tick = size * 0.45;
  const thin = 0.25;
  const black = '#000000';
  const prims: Prim[] = [];
  const text = (
    t: string,
    x: number,
    y: number,
    align: 'left' | 'center' | 'right',
    rotate?: number,
  ): Prim => ({
    kind: 'text',
    runs: parseRich(t),
    x,
    y,
    size,
    colour: black,
    align,
    ...(rotate ? { rotate } : {}),
  });
  const base = chart.yLog ? (l.yTicks[0] ?? 1) : Math.max(chart.yMin ?? 0, l.yTicks[0] ?? 0);

  // Bars, lines and dots, under the axes.
  chart.series.forEach((s, si) => {
    const marks = l.marks[si] ?? [];
    if (chart.type === 'bar') {
      marks.forEach((m) => {
        if (!finite(m.value)) return;
        const yTop = l.y(m.value);
        const yBase = l.y(base);
        prims.push({
          kind: 'rect',
          box: {
            x: m.x - l.barWidth / 2,
            y: Math.min(yTop, yBase),
            w: l.barWidth,
            h: Math.abs(yBase - yTop),
          },
          fill: s.colour,
          stroke: black,
          width: thin,
        });
      });
    }
    if (chart.type === 'line') {
      const pts = marks.filter((m) => finite(m.value));
      for (let i = 1; i < pts.length; i += 1) {
        const p = pts[i - 1];
        const q = pts[i];
        if (!p || !q) continue;
        prims.push({
          kind: 'line',
          from: [p.x, l.y(p.value)],
          to: [q.x, l.y(q.value)],
          stroke: s.colour === '#ffffff' ? black : s.colour,
          width: thin * 1.6,
        });
      }
    }
    // Error bars: up from a bar; up and down from a point.
    marks.forEach((m) => {
      if (!finite(m.value) || m.error <= 0) return;
      const cap = chart.type === 'bar' ? l.barWidth * 0.22 : size * 0.35;
      const yHi = l.y(m.value + m.error);
      const yLo = chart.type === 'bar' ? l.y(m.value) : l.y(m.value - m.error);
      prims.push({ kind: 'line', from: [m.x, yLo], to: [m.x, yHi], stroke: black, width: thin });
      prims.push({
        kind: 'line',
        from: [m.x - cap, yHi],
        to: [m.x + cap, yHi],
        stroke: black,
        width: thin,
      });
      if (chart.type !== 'bar')
        prims.push({
          kind: 'line',
          from: [m.x - cap, yLo],
          to: [m.x + cap, yLo],
          stroke: black,
          width: thin,
        });
    });
    const colour = s.colour === '#ffffff' ? black : s.colour;
    if (chart.type === 'line') {
      marks.forEach((m) => {
        if (finite(m.value)) prims.push(circle(m.x, l.y(m.value), size * 0.3, colour));
      });
    }
    // Points have their mean marked across them.
    if (chart.type === 'scatter') {
      marks.forEach((m) => {
        if (!finite(m.value)) return;
        const y = l.y(m.value);
        prims.push({
          kind: 'line',
          from: [m.x - size * 0.9, y],
          to: [m.x + size * 0.9, y],
          stroke: black,
          width: thin * 1.6,
        });
      });
    }
    if (chart.dots || chart.type === 'scatter') {
      const r = size * (chart.type === 'scatter' ? 0.26 : 0.2);
      s.values.forEach((vals, gi) => {
        const m = marks[gi];
        if (!m) return;
        const width = chart.type === 'bar' ? l.barWidth * 0.5 : size * 0.8;
        vals.forEach((v, i) => {
          if (!finite(v)) return;
          prims.push(
            circle(
              m.x + jitter(i, vals.length, width),
              l.y(v),
              r,
              chart.type === 'bar' ? '#ffffff' : colour,
              chart.type === 'bar' ? black : undefined,
            ),
          );
        });
      });
    }
  });

  // Axes, ticks and their labels.
  prims.push({
    kind: 'line',
    from: [plot.x, plot.y],
    to: [plot.x, plot.y + plot.h],
    stroke: black,
    width: thin,
  });
  prims.push({
    kind: 'line',
    from: [plot.x, plot.y + plot.h],
    to: [plot.x + plot.w, plot.y + plot.h],
    stroke: black,
    width: thin,
  });
  for (const t of l.yTicks) {
    const y = l.y(t);
    prims.push({
      kind: 'line',
      from: [plot.x - tick, y],
      to: [plot.x, y],
      stroke: black,
      width: thin,
    });
    prims.push(text(tickText(t), plot.x - tick - size * 0.25, y, 'right'));
  }
  const numericX =
    chart.type !== 'bar' && chart.groups.every((g) => finite(Number(g)) && g.trim() !== '');
  chart.groups.forEach((g, i) => {
    const x = l.groupX[i] ?? 0;
    const yAxis = plot.y + plot.h;
    prims.push({
      kind: 'line',
      from: [x, yAxis],
      to: [x, yAxis + tick],
      stroke: black,
      width: thin,
    });
    if (chart.slant && !numericX)
      prims.push(text(g, x + size * 0.2, yAxis + tick + size * 0.3, 'right', 45));
    else prims.push(text(g, x, yAxis + tick + line * 0.5, 'center'));
  });
  if (chart.yLabel.trim() !== '') {
    prims.push(text(chart.yLabel, box.x + line * 0.5, plot.y + plot.h / 2, 'center', 90));
  }
  if (chart.xLabel.trim() !== '') {
    prims.push(text(chart.xLabel, plot.x + plot.w / 2, box.y + box.h - line * 0.5, 'center'));
  }

  // Which series is which.
  if (chart.series.length > 1 && chart.legend !== 'none') {
    const swatch = size * 0.9;
    const rowH = line * 1.05;
    const widths = chart.series.map(
      (s) => textWidth(parseRich(s.name), size) + swatch + size * 1.4,
    );
    const start =
      chart.legend === 'right'
        ? { x: plot.x + plot.w + size * 0.8, y: plot.y + line * 0.4 }
        : chart.legend === 'inside'
          ? { x: plot.x + plot.w - Math.max(...widths), y: plot.y + line * 0.4 }
          : { x: plot.x, y: box.y + size * 0.6 };
    let across = start.x;
    chart.series.forEach((s, i) => {
      const x = chart.legend === 'top' ? across : start.x;
      const y = chart.legend === 'top' ? start.y : start.y + i * rowH;
      if (chart.type === 'bar') {
        prims.push({
          kind: 'rect',
          box: { x, y: y - swatch / 2, w: swatch, h: swatch },
          fill: s.colour,
          stroke: black,
          width: thin,
        });
      } else {
        const colour = s.colour === '#ffffff' ? black : s.colour;
        if (chart.type === 'line')
          prims.push({
            kind: 'line',
            from: [x - size * 0.2, y],
            to: [x + swatch + size * 0.2, y],
            stroke: colour,
            width: thin * 1.6,
          });
        prims.push(circle(x + swatch / 2, y, size * 0.3, colour));
      }
      prims.push(text(s.name, x + swatch + size * 0.5, y, 'left'));
      across += widths[i] ?? 0;
    });
  }

  // Brackets with their stars, over the bars they join.
  const flat =
    chart.type === 'bar'
      ? chart.groups.flatMap((_g, gi) => l.marks.map((ms) => ms[gi]))
      : (l.marks[0] ?? []);
  const xOf = (i: number) =>
    chart.type === 'bar' && chart.series.length > 1 ? flat[i]?.x : l.groupX[i];
  const topOf = (i: number) =>
    chart.type === 'bar' && chart.series.length > 1
      ? (flat[i]?.top ?? -Infinity)
      : Math.max(...l.marks.map((ms) => ms[i]?.top ?? -Infinity));
  const placed = placeBrackets(chart.brackets);
  const heights = new Map<string, number>();
  for (const b of placed) {
    const a = xOf(b.lo);
    const c = xOf(b.hi);
    if (a === undefined || c === undefined) continue;
    let highest = Infinity;
    for (let i = b.lo; i <= b.hi; i += 1) {
      const t = topOf(i);
      if (finite(t)) highest = Math.min(highest, l.y(t));
    }
    // Above the data it spans, and above any bracket it covers.
    for (const p of placed) {
      const h = heights.get(p.id);
      if (h !== undefined && p.lo <= b.hi && p.hi >= b.lo)
        highest = Math.min(highest, h - line * 0.25);
    }
    if (!finite(highest)) highest = plot.y;
    const y = highest - line * 1.1;
    heights.set(b.id, y - line * 0.3);
    const drop = size * 0.45;
    prims.push({ kind: 'line', from: [a, y], to: [c, y], stroke: black, width: thin });
    prims.push({ kind: 'line', from: [a, y], to: [a, y + drop], stroke: black, width: thin });
    prims.push({ kind: 'line', from: [c, y], to: [c, y + drop], stroke: black, width: thin });
    if (b.text.trim() !== '') {
      const stars = /^\*+$/.test(b.text.trim());
      prims.push({
        kind: 'text',
        runs: stars
          ? [{ text: b.text.trim(), bold: true, italic: false, shift: 'none' }]
          : parseRich(b.text),
        x: (a + c) / 2,
        y: y - size * (stars ? 0.25 : 0.55),
        size: stars ? size * 1.25 : size,
        colour: black,
        align: 'center',
      });
    }
  }
  return prims;
}

// ---- Reading ----

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const objects = (v: unknown) =>
  (Array.isArray(v) ? (v as unknown[]) : []).filter(
    (x): x is Record<string, unknown> => !!x && typeof x === 'object',
  );

export function parseChart(raw: unknown): Chart {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const base = newChart();
  const groups = (Array.isArray(r['groups']) ? (r['groups'] as unknown[]) : base.groups)
    .map((g) => str(g))
    .slice(0, 60);
  const series = objects(r['series'])
    .slice(0, 12)
    .map((s, i): Series => ({
      id: str(s['id']) || newId(),
      name: str(s['name'], `Series ${String(i + 1)}`),
      colour:
        typeof s['colour'] === 'string' && /^#[0-9a-f]{6}$/i.test(s['colour'])
          ? s['colour']
          : (SERIES_COLOURS[i % SERIES_COLOURS.length] ?? '#4d4d4d'),
      values: groups.map((_g, gi) => {
        const v = Array.isArray(s['values']) ? (s['values'] as unknown[])[gi] : undefined;
        return (Array.isArray(v) ? (v as unknown[]) : []).filter(num).slice(0, 500);
      }),
    }));
  const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
    list.find((x) => x === v) ?? fallback;
  const n = groups.length * Math.max(1, series.length);
  return {
    type: pick(CHART_TYPES, r['type'], 'bar'),
    groups,
    series: series.length > 0 ? series : base.series,
    error: pick(ERROR_KINDS, r['error'], 'sem'),
    dots: r['dots'] !== false,
    xLabel: str(r['xLabel']),
    yLabel: str(r['yLabel']),
    yMin: num(r['yMin']) ? r['yMin'] : null,
    yMax: num(r['yMax']) ? r['yMax'] : null,
    yLog: r['yLog'] === true,
    xLog: r['xLog'] === true,
    slant: r['slant'] === true,
    legend: pick(LEGEND_PLACES, r['legend'], 'top'),
    brackets: objects(r['brackets'])
      .filter((b) => num(b['from']) && num(b['to']))
      .map((b) => ({
        id: str(b['id']) || newId(),
        from: Math.max(0, Math.min(n - 1, Math.floor(b['from'] as number))),
        to: Math.max(0, Math.min(n - 1, Math.floor(b['to'] as number))),
        text: str(b['text']),
      }))
      .slice(0, 20),
    size: num(r['size']) ? Math.min(24, Math.max(4, r['size'])) : 7,
  };
}
