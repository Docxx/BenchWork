import type { PlotTrace } from 'plotly.js-dist-min';
import { columnName, type CellValue } from './formula';

/**
 * Quick plots of a sheet's columns: scatter, line, bar or box, optionally
 * split into groups by another column (such as genotype).
 */

export type ChartType = 'scatter' | 'line' | 'bar' | 'box';

export interface PlotChoice {
  type: ChartType;
  /** Column for the x axis; not used by box plots. */
  x: number;
  y: number;
  /** Column whose values split the data into groups, or null. */
  group: number | null;
  /** Whether the first row names the columns. */
  headings: boolean;
}

/** A column's name: its heading, or its letter. */
export function columnLabel(
  values: readonly CellValue[][],
  col: number,
  headings: boolean,
): string {
  const heading = headings ? values[0]?.[col] : undefined;
  return typeof heading === 'string' && heading.trim() !== '' ? heading : columnName(col);
}

/** The traces for a plot. Rows without a number for y are left out. */
export function plotTraces(values: readonly CellValue[][], choice: PlotChoice): PlotTrace[] {
  const rows = choice.headings ? values.slice(1) : values;
  const groups = new Map<string, { x: (number | string)[]; y: number[] }>();
  for (const row of rows) {
    const y = row[choice.y];
    if (typeof y !== 'number') continue;
    const key = choice.group === null ? '' : String(row[choice.group] ?? '');
    const g = groups.get(key) ?? { x: [], y: [] };
    g.x.push(row[choice.x] ?? '');
    g.y.push(y);
    groups.set(key, g);
  }
  return [...groups].map(([name, g]) => {
    const base = choice.group === null ? {} : { name: name || '(blank)' };
    switch (choice.type) {
      case 'box':
        // One box per group, each named, side by side.
        return { ...base, type: 'box', y: g.y };
      case 'bar':
        return { ...base, type: 'bar', x: g.x, y: g.y };
      case 'line':
        return { ...base, type: 'scatter', mode: 'lines+markers', x: g.x, y: g.y };
      default:
        return { ...base, type: 'scatter', mode: 'markers', x: g.x, y: g.y };
    }
  });
}
