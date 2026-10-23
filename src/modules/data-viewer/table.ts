import * as XLSX from 'xlsx';
import { asNumber, evaluateSheet, type CellValue } from './formula';

/**
 * Data files as sheets of cells, as typed: numbers and text as they are,
 * formulas starting with `=`. CSV and TSV files keep their line endings
 * and delimiter; Excel files keep their sheets, values and formulas, but
 * not formatting such as colours.
 */

export type FileFormat = 'csv' | 'tsv' | 'xlsx' | 'xls';

export interface Sheet {
  name: string;
  rows: string[][];
}

export interface Workbook {
  format: FileFormat;
  sheets: Sheet[];
  /** For CSV and TSV: the line ending, and whether the file ended with one. */
  eol: '\n' | '\r\n';
  finalNewline: boolean;
}

/** Larger files open read-only: editing them here would be slow. */
export const MAX_EDIT_ROWS = 5000;
export const MAX_EDIT_COLUMNS = 200;

export function formatOf(path: string): FileFormat | null {
  const ext = path.toLowerCase().slice(path.lastIndexOf('.') + 1);
  return ext === 'csv' || ext === 'tsv' || ext === 'xlsx' || ext === 'xls' ? ext : null;
}

/** Splits CSV or TSV into rows of fields, following RFC 4180 quoting. */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const body = text.startsWith('﻿') ? text.slice(1) : text;
  while (i < body.length) {
    const ch = body[i] ?? '';
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      i += 1;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
      i += 1;
    } else if (ch === '\r' || ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += ch === '\r' && body[i + 1] === '\n' ? 2 : 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function quote(field: string, delimiter: string): string {
  return field.includes(delimiter) ||
    field.includes('"') ||
    field.includes('\n') ||
    field.includes('\r') ||
    field !== field.trim()
    ? `"${field.replace(/"/g, '""')}"`
    : field;
}

/** Writes rows as CSV or TSV, quoting only fields that need it. */
export function writeDelimited(
  rows: readonly (readonly string[])[],
  delimiter: string,
  eol: string,
  finalNewline: boolean,
): string {
  const text = rows.map((r) => r.map((f) => quote(f, delimiter)).join(delimiter)).join(eol);
  return finalNewline && rows.length > 0 ? `${text}${eol}` : text;
}

function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell) return '';
  if (cell.f) return `=${cell.f}`;
  if (cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  if (cell.v === undefined) return '';
  return typeof cell.v === 'string' ? cell.v : String(cell.v);
}

/** Reads a data file. */
export function readWorkbook(path: string, bytes: Uint8Array): Workbook {
  const format = formatOf(path);
  if (format === null) throw new Error('This is not a CSV, TSV or Excel file.');
  if (format === 'csv' || format === 'tsv') {
    const text = new TextDecoder().decode(bytes);
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    return {
      format,
      sheets: [{ name: 'Sheet1', rows: parseDelimited(text, format === 'tsv' ? '\t' : ',') }],
      eol,
      finalNewline: /\r?\n$/.test(text),
    };
  }
  const book = XLSX.read(bytes, { type: 'array', cellFormula: true, cellDates: true });
  const sheets = book.SheetNames.map((name) => {
    const sheet = book.Sheets[name];
    const ref = sheet?.['!ref'];
    if (!sheet || !ref) return { name, rows: [] };
    const range = XLSX.utils.decode_range(ref);
    const rows: string[][] = [];
    for (let r = 0; r <= range.e.r; r += 1) {
      const row: string[] = [];
      for (let c = 0; c <= range.e.c; c += 1) {
        row.push(cellText(sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined));
      }
      rows.push(row);
    }
    return { name, rows };
  });
  return { format, sheets, eol: '\n', finalNewline: true };
}

/** Writes a workbook back in its own format. Excel files keep formulas with their results. */
export function writeWorkbook(book: Workbook): Uint8Array {
  if (book.format === 'csv' || book.format === 'tsv') {
    const sheet = book.sheets[0];
    // CSV cannot hold formulas, so their results are written.
    const values = evaluateSheet(sheet?.rows ?? []);
    const rows = (sheet?.rows ?? []).map((r, ri) =>
      r.map((raw, ci) => (raw.startsWith('=') ? String(values[ri]?.[ci] ?? '') : raw)),
    );
    const text = writeDelimited(
      rows,
      book.format === 'tsv' ? '\t' : ',',
      book.eol,
      book.finalNewline,
    );
    return new TextEncoder().encode(text);
  }
  if (book.format === 'xls') throw new Error('Old .xls files are read-only here.');
  const out = XLSX.utils.book_new();
  for (const sheet of book.sheets) {
    const values = evaluateSheet(sheet.rows);
    const ws: XLSX.WorkSheet = {};
    let maxR = -1;
    let maxC = -1;
    sheet.rows.forEach((row, r) => {
      row.forEach((raw, c) => {
        if (raw === '') return;
        const address = XLSX.utils.encode_cell({ r, c });
        const value: CellValue = values[r]?.[c] ?? '';
        if (raw.startsWith('=')) {
          ws[address] =
            typeof value === 'number'
              ? { t: 'n', v: value, f: raw.slice(1) }
              : { t: 's', v: value, f: raw.slice(1) };
        } else {
          const n = asNumber(raw);
          ws[address] = n === null ? { t: 's', v: raw } : { t: 'n', v: n };
        }
        maxR = Math.max(maxR, r);
        maxC = Math.max(maxC, c);
      });
    });
    if (maxR >= 0)
      ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
    XLSX.utils.book_append_sheet(out, ws, sheet.name);
  }
  const data = XLSX.write(out, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Uint8Array(data);
}

// ---- Changing a sheet; each returns new rows ----

function width(rows: readonly (readonly string[])[]): number {
  return Math.max(1, ...rows.map((r) => r.length));
}

export function setCell(
  rows: readonly string[][],
  row: number,
  col: number,
  raw: string,
): string[][] {
  const next = rows.map((r) => [...r]);
  while (next.length <= row) next.push([]);
  const target = next[row] ?? [];
  while (target.length <= col) target.push('');
  target[col] = raw;
  next[row] = target;
  return next;
}

export function insertRow(rows: readonly string[][], at: number): string[][] {
  const next = rows.map((r) => [...r]);
  next.splice(
    at,
    0,
    Array.from({ length: width(rows) }, () => ''),
  );
  return next;
}

export function deleteRow(rows: readonly string[][], at: number): string[][] {
  return rows.filter((_, i) => i !== at).map((r) => [...r]);
}

export function insertColumn(rows: readonly string[][], at: number): string[][] {
  const w = width(rows);
  return (rows.length === 0 ? [[]] : rows).map((r) => {
    const padded = [...r, ...Array.from({ length: Math.max(0, w - r.length) }, () => '')];
    padded.splice(at, 0, '');
    return padded;
  });
}

export function deleteColumn(rows: readonly string[][], at: number): string[][] {
  return rows.map((r) => r.filter((_, i) => i !== at));
}

/**
 * Sorts rows by a column, numbers by size and text alphabetically, keeping
 * the first row in place when it holds headings. Rows keep their formulas,
 * which still refer to the same cells, as Excel does.
 */
export function sortRows(
  rows: readonly string[][],
  col: number,
  direction: 1 | -1,
  headings: boolean,
): string[][] {
  const head = headings ? rows.slice(0, 1) : [];
  const body = (headings ? rows.slice(1) : rows).map((r) => [...r]);
  const key = (r: string[]) => r[col] ?? '';
  body.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x === '' || y === '') return x === y ? 0 : x === '' ? 1 : -1;
    const nx = asNumber(x);
    const ny = asNumber(y);
    const order =
      nx !== null && ny !== null
        ? nx - ny
        : nx !== null
          ? -1
          : ny !== null
            ? 1
            : x.localeCompare(y, 'en-GB', { numeric: true });
    return order * direction;
  });
  return [...head.map((r) => [...r]), ...body];
}
