/**
 * Fly room's records. Each stock and each cross is a small YAML file, such
 * as `Fly room/Stocks/w1118.flystock.yaml`, so they link with `[[w1118]]`,
 * are found by search, sync like any file and read plainly without
 * BenchWork. Fly stocks made by the Inventory module are the same kind and
 * show here too, wherever they are.
 */

export const STOCK_KIND = 'flystock';
export const CROSS_KIND = 'flycross';
export const STOCK_FOLDER = 'Fly room/Stocks';
export const CROSS_FOLDER = 'Fly room/Crosses';

export const STOCK_STATUSES = ['Healthy', 'Quarantine', 'Weak', 'Dead'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const CROSS_STATUSES = ['Planned', 'Set up', 'Collecting', 'Done', 'Failed'] as const;
export type CrossStatus = (typeof CROSS_STATUSES)[number];

export interface Stock {
  path: string;
  /** Its name, as `[[name]]` links to it. */
  name: string;
  genotype: string;
  source: string;
  /** The stock centre's number, such as a Bloomington number. */
  number: string;
  location: string;
  status: StockStatus;
  /** `YYYY-MM-DD`, or empty. */
  established: string;
  /** Alleles that kill in two copies, besides the usual markers. */
  lethal: string[];
  /** A FlyBase ID such as FBst0093769, or empty. */
  flybase: string;
  /** Projects and the like, for finding stocks together. */
  tags: string[];
  flipEvery: number | null;
  lastFlipped: string;
  notes: string;
}

export interface Cross {
  path: string;
  name: string;
  /** `[[stock]]`, or empty when typed in. */
  mother: string;
  motherGenotype: string;
  father: string;
  fatherGenotype: string;
  setUp: string;
  temperature: number;
  status: CrossStatus;
  /** Ticked-off steps, by id. */
  done: string[];
  /** The cross these parents came from: `[[cross]]`, or empty. */
  parent: string;
  /** The progeny wanted, as a genotype. */
  wanted: string;
  purpose: string;
  notes: string;
}

/** A value as text: dates as `YYYY-MM-DD`. */
export function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter((v) => v !== '');
  return text(value)
    .split(/[;,]/)
    .map((v) => v.trim())
    .filter((v) => v !== '');
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  const v = text(value).toLowerCase() === 'lost' ? 'dead' : text(value).toLowerCase();
  return options.find((o) => o.toLowerCase() === v) ?? fallback;
}

/** The name in a file name: `Fly room/Stocks/w1118.flystock.yaml` is `w1118`. */
export function nameOf(path: string, kind: string): string {
  const base = path.split('/').at(-1) ?? path;
  const end = `.${kind}.yaml`;
  return base.toLowerCase().endsWith(end) ? base.slice(0, base.length - end.length) : base;
}

export function readStock(path: string, data: Record<string, unknown>): Stock {
  const every = Number(text(data['flipEvery']));
  return {
    path,
    name: nameOf(path, STOCK_KIND),
    genotype: text(data['genotype']),
    source: text(data['source']),
    number: text(data['number']),
    location: text(data['location']),
    status: oneOf(data['status'], STOCK_STATUSES, 'Healthy'),
    established: text(data['established']).slice(0, 10),
    lethal: list(data['lethal']),
    flybase: text(data['flybase']),
    tags: list(data['tags']),
    flipEvery: Number.isFinite(every) && every > 0 ? Math.round(every) : null,
    lastFlipped: text(data['lastFlipped']).slice(0, 10),
    notes: text(data['notes']),
  };
}

export function readCross(path: string, data: Record<string, unknown>): Cross {
  const temperature = Number(text(data['temperature']));
  return {
    path,
    name: nameOf(path, CROSS_KIND),
    mother: text(data['mother']),
    motherGenotype: text(data['motherGenotype']),
    father: text(data['father']),
    fatherGenotype: text(data['fatherGenotype']),
    setUp: text(data['setUp']).slice(0, 10),
    temperature: Number.isFinite(temperature) && temperature > 0 ? temperature : 25,
    status: oneOf(data['status'], CROSS_STATUSES, 'Planned'),
    done: list(data['done']),
    parent: text(data['parent']),
    wanted: text(data['wanted']),
    purpose: text(data['purpose']),
    notes: text(data['notes']),
  };
}

/** The name inside a `[[link]]` or `[[link|label]]`, or the text itself. */
export function linkName(value: string): string {
  const m = /^\[\[([^[\]|]+)(?:\|[^[\]]*)?\]\]$/.exec(value.trim());
  return (m?.[1] ?? value).trim();
}

/** A name that is safe as a file name: no slashes or other awkward characters. */
export function safeName(name: string): string {
  return name
    .replace(/\[([^[\]]*)\]/g, '-$1')
    .replace(/[\\/:*?"<>|#^[\]]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
    .slice(0, 80);
}

// ---- Importing stocks from a CSV, such as another lab manager's export ----

/** Reads CSV text: quoted fields, doubled quotes, commas or semicolons. */
export function parseCsv(input: string): string[][] {
  const textIn = input.replace(/^﻿/, '');
  const firstLine = textIn.split(/\r?\n/, 1)[0] ?? '';
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < textIn.length; i += 1) {
    const ch = textIn.charAt(i);
    if (quoted) {
      if (ch === '"' && textIn[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && textIn[i + 1] === '\n') i += 1;
      row.push(field);
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

/** Column names that mean each field, lower case, matched loosely. */
const COLUMNS: Record<string, readonly string[]> = {
  // A chromosome's second copy, often headed as its balancer. Matched first,
  // as its heading also contains the chromosome's.
  xOther: ['chr x/y balancer', 'chr x balancer', 'x balancer', 'x chromosome balancer'],
  twoOther: ['chr 2 balancer', 'chromosome 2 balancer', '2 balancer', 'chr ii balancer'],
  threeOther: ['chr 3 balancer', 'chromosome 3 balancer', '3 balancer', 'chr iii balancer'],
  fourOther: ['chr 4 balancer', 'chromosome 4 balancer', '4 balancer', 'chr iv balancer'],
  name: ['name', 'stock name', 'title', 'line', 'label'],
  genotype: ['genotype', 'full genotype'],
  x: ['x', 'x chromosome', 'chr x/y', 'chr x', 'chromosome x', 'chrx'],
  two: ['2', 'chromosome 2', 'chr 2', 'chr2', 'chromosome ii', 'ii'],
  three: ['3', 'chromosome 3', 'chr 3', 'chr3', 'chromosome iii', 'iii'],
  four: ['4', 'chromosome 4', 'chr 4', 'chr4', 'chromosome iv', 'iv'],
  source: ['source', 'received from', 'origin', 'supplier'],
  number: [
    'bloomington #',
    'bloomington',
    'stock number',
    'serial',
    'source serial',
    'stock n.',
    'stock no',
    'bdsc',
    'number',
    'id',
  ],
  location: ['location', 'stock room', 'room', 'where', 'rack'],
  status: ['status', 'health'],
  established: ['date added', 'date established', 'established', 'added', 'date', 'created'],
  notes: ['notes', 'comment', 'comments', 'description', 'reference'],
};

export interface ImportedStock {
  name: string;
  data: Record<string, unknown>;
}

const FIELD_ORDER = Object.keys(COLUMNS);

/** Which field each column is, by its heading; null for a column not used. */
export function mapColumns(headings: readonly string[]): (string | null)[] {
  const taken = new Set<string>();
  const norm = headings.map((h) =>
    h
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, ' '),
  );
  const result: (string | null)[] = norm.map(() => null);
  // Exact matches first, then headings that contain a name.
  for (const exact of [true, false]) {
    for (const field of FIELD_ORDER) {
      if (taken.has(field)) continue;
      const names = COLUMNS[field] ?? [];
      const i = norm.findIndex(
        (h, j) =>
          result[j] === null &&
          names.some((n) => (exact ? h === n : n.length > 2 && h.includes(n))),
      );
      if (i >= 0) {
        result[i] = field;
        taken.add(field);
      }
    }
  }
  return result;
}

/** A date as `YYYY-MM-DD`: from `2026-08-04`, `04/08/2026` (day first) or `August 4, 2026`. */
export function isoDate(value: string): string {
  const v = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  const pad = (n: string) => n.padStart(2, '0');
  if (iso) return `${iso[1] ?? ''}-${pad(iso[2] ?? '')}-${pad(iso[3] ?? '')}`;
  const dmy = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(v);
  if (dmy) return `${dmy[3] ?? ''}-${pad(dmy[2] ?? '')}-${pad(dmy[1] ?? '')}`;
  const parsed = Date.parse(v);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return `${String(d.getFullYear())}-${pad(String(d.getMonth() + 1))}-${pad(String(d.getDate()))}`;
  }
  return '';
}

/**
 * A row with more fields than headings, from an export that left commas
 * inside a field unquoted: `mdr65-Gal4, UAS-GFP` split in two. Such commas
 * are followed by a space and column breaks are not, so fields starting
 * with a space are joined back to the one before, as many as there are extra.
 */
export function mendRow(row: readonly string[], width: number): string[] {
  const fields = [...row];
  for (let i = 1; i < fields.length && fields.length > width;) {
    const field = fields[i] ?? '';
    if (field.startsWith(' ')) {
      fields.splice(i - 1, 2, `${fields[i - 1] ?? ''},${field}`);
    } else {
      i += 1;
    }
  }
  return fields;
}

/**
 * Stocks from a CSV: one per row with a name or a genotype. A genotype in
 * separate chromosome columns is joined as `X ; 2 ; 3 ; 4`, with a second
 * copy (or balancer) column after a slash; a genotype column beside those,
 * often a short summary, becomes the name if there is no name column.
 */
export function stocksFromCsv(input: string): ImportedStock[] {
  const [head, ...rows] = parseCsv(input);
  if (!head) return [];
  const columns = mapColumns(head);
  const stocks: ImportedStock[] = [];
  for (const raw of rows) {
    const row = mendRow(raw, head.length);
    const get = (field: string) => {
      const i = columns.indexOf(field);
      return i >= 0 ? (row[i] ?? '').trim() : '';
    };
    const parts = ['x', 'two', 'three', 'four'].map((c) => {
      const first = get(c);
      const other = get(`${c}Other`);
      return other === '' ? first : `${first || '+'}/${other}`;
    });
    const split = parts.some((p) => p !== '');
    // Chromosome columns, where there are any, are the full genotype; a
    // genotype column beside them is then a short name for the stock.
    const genotype = split ? parts.map((p) => p || '+').join(' ; ') : get('genotype');
    const name = safeName(get('name') || (split ? get('genotype') : '') || genotype);
    if (name === '') continue;
    const data: Record<string, unknown> = { genotype };
    for (const field of ['source', 'number', 'location', 'notes'] as const) {
      const v = get(field);
      if (v !== '' && !/^(n\/a|unknown|-)$/i.test(v)) data[field] = v;
    }
    const status = get('status');
    if (status !== '') data['status'] = oneOf(status, STOCK_STATUSES, 'Healthy');
    const established = isoDate(get('established'));
    if (established !== '') data['established'] = established;
    stocks.push({ name, data });
  }
  return stocks;
}
