import { isMap, parseDocument, stringify, type Document } from 'yaml';

/**
 * Pages are Markdown files that may start with a YAML block between `---`
 * lines. BenchWork reads a few known keys from it and leaves everything
 * else (other keys, comments, order, line endings) exactly as it was.
 */

/** The keys BenchWork itself uses. Every other key is kept as it is. */
export interface PageMeta {
  /** Stable UUID, so links survive renames and moves. */
  id: string | null;
  /** `page` unless a module says otherwise, such as `experiment`. */
  type: string;
  created: string | null;
  modified: string | null;
  tags: string[];
}

export interface ParsedPage {
  /** The YAML text between the `---` lines, or null if the page has none. */
  yaml: string | null;
  /** Everything after the frontmatter. */
  body: string;
  meta: PageMeta;
  /** Why the frontmatter could not be read; it is then kept exactly as it is. */
  error: string | null;
  /** The page's own line ending, so saving keeps it. */
  eol: '\n' | '\r\n';
  /** True if the file started with a UTF-8 byte order mark. */
  bom: boolean;
}

const BOM = '﻿';
const FENCE = /^---[ \t]*$/;

function emptyMeta(): PageMeta {
  return { id: null, type: 'page', created: null, modified: null, tags: [] };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Tags may be a YAML list or one comma-separated string; a leading `#` is dropped. */
function readTags(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const tags = raw
    .filter((t): t is string | number => typeof t === 'string' || typeof t === 'number')
    .map((t) => String(t).trim().replace(/^#/, ''))
    .filter((t) => t !== '');
  return [...new Set(tags)];
}

function readMeta(data: unknown): PageMeta {
  const meta = emptyMeta();
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return meta;
  const record = data as Record<string, unknown>;
  meta.id = stringOrNull(record['id']);
  meta.type = stringOrNull(record['type']) ?? 'page';
  meta.created = stringOrNull(record['created']);
  meta.modified = stringOrNull(record['modified']);
  meta.tags = readTags(record['tags']);
  return meta;
}

/** Splits a page into its frontmatter and body, and reads the known keys. */
export function parsePage(text: string): ParsedPage {
  const bom = text.startsWith(BOM);
  const content = bom ? text.slice(1) : text;
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const base = { meta: emptyMeta(), error: null, eol, bom } as const;

  const lines = content.split(/\r?\n/);
  if (lines.length < 2 || !FENCE.test(lines[0] ?? '')) {
    return { ...base, yaml: null, body: content };
  }
  const close = lines.findIndex((line, i) => i > 0 && FENCE.test(line));
  if (close === -1) return { ...base, yaml: null, body: content };

  const yaml = lines.slice(1, close).join('\n');
  const body = lines.slice(close + 1).join(eol);
  const doc = parseDocument(yaml);
  if (doc.errors.length > 0) {
    return { ...base, yaml, body, error: doc.errors[0]?.message ?? 'Invalid YAML' };
  }
  return { ...base, yaml, body, meta: readMeta(doc.toJS()) };
}

/** Joins frontmatter and body back into file text, in the page's own style. */
export function serialisePage(page: Pick<ParsedPage, 'yaml' | 'body' | 'eol' | 'bom'>): string {
  const yamlLines = page.yaml === null || page.yaml === '' ? [] : page.yaml.split('\n');
  const head = page.yaml === null ? '' : ['---', ...yamlLines, '---', ''].join(page.eol);
  return `${page.bom ? BOM : ''}${head}${page.body}`;
}

export type MetaChanges = Partial<Omit<PageMeta, 'tags'>> & { tags?: string[] };

/**
 * Returns the page with some known keys set, keeping every other key and
 * comment. `null` removes a key. Keys new to the page go first for `id`,
 * otherwise at the end. Refuses if the frontmatter could not be read, so a
 * broken block is never overwritten.
 */
export function updateMeta(page: ParsedPage, changes: MetaChanges): ParsedPage {
  return updateProperties(page, changes);
}

/** Frontmatter as plain data: every key, not only the known ones. Empty if unreadable. */
export function pageProperties(page: ParsedPage): Record<string, unknown> {
  if (page.yaml === null || page.error !== null) return {};
  const data: unknown = parseDocument(page.yaml).toJS();
  return typeof data === 'object' && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

/**
 * Like updateMeta, for any keys: sets them, keeping every other key and
 * comment. `null` or an empty list removes a key.
 */
export function updateProperties(
  page: ParsedPage,
  changes: Readonly<Record<string, unknown>>,
): ParsedPage {
  if (page.error !== null) {
    throw new Error(`The page settings could not be read, so they were left alone: ${page.error}`);
  }
  const doc: Document = parseDocument(page.yaml ?? '');
  if (doc.contents !== null && !isMap(doc.contents)) {
    throw new Error('The page settings are not a list of keys, so they were left alone');
  }
  const entries = Object.entries(changes).filter(([, v]) => v !== undefined);

  // Prefer editing just the lines for these keys, so every other line stays
  // exactly as the person wrote it. Fall back to reprinting the block.
  const yaml = editLines(page.yaml ?? '', entries) ?? reprint(doc, entries);
  const next: ParsedPage = { ...page, yaml: yaml === '' && page.yaml === null ? null : yaml };
  return { ...next, meta: readMeta(parseDocument(next.yaml ?? '').toJS()) };
}

const PRINT = { lineWidth: 0, flowCollectionPadding: false } as const;

/** One value as YAML text on a single line: a scalar, or a flow list for tags. */
function inlineValue(value: unknown): string {
  const one = (v: unknown) => stringify(v, PRINT).trimEnd();
  return Array.isArray(value) ? `[${value.map(one).join(', ')}]` : one(value);
}

function isRemoval(value: unknown): boolean {
  return value === null || (Array.isArray(value) && value.length === 0);
}

/**
 * Edits top-level `key: value` lines in place. A key's lines are its own
 * line plus any indented or `- ` lines after it. Returns null if the result
 * would not read back as intended, so the caller can reprint instead.
 */
function editLines(yaml: string, entries: [string, unknown][]): string | null {
  let lines = yaml === '' ? [] : yaml.split('\n');
  for (const [key, value] of entries) {
    // Keys that would need quoting are left to the reprint.
    if (!/^[A-Za-z_][\w-]*$/.test(key)) return null;
    const start = lines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l));
    let end = start + 1;
    if (start !== -1) {
      while (end < lines.length && /^(\s|- |-$)/.test(lines[end] ?? '')) end += 1;
    }
    if (isRemoval(value)) {
      if (start !== -1) lines = [...lines.slice(0, start), ...lines.slice(end)];
      continue;
    }
    const line = `${key}: ${inlineValue(value)}`;
    if (start !== -1) lines = [...lines.slice(0, start), line, ...lines.slice(end)];
    else if (key === 'id')
      lines = [line, ...lines]; // where people expect to find it
    else lines = [...lines, line];
  }

  const result = lines.join('\n');
  const check = parseDocument(result);
  if (check.errors.length > 0) return null;
  const data = (check.toJS() ?? {}) as Record<string, unknown>;
  const before = (parseDocument(yaml).toJS() ?? {}) as Record<string, unknown>;
  const changed = new Set(entries.map(([k]) => k));
  for (const [key, value] of entries) {
    const expected = isRemoval(value) ? undefined : value;
    if (JSON.stringify(data[key]) !== JSON.stringify(expected)) return null;
  }
  for (const key of new Set([...Object.keys(before), ...Object.keys(data)])) {
    if (!changed.has(key) && JSON.stringify(before[key]) !== JSON.stringify(data[key])) {
      return null;
    }
  }
  return result;
}

function reprint(doc: Document, entries: [string, unknown][]): string {
  for (const [key, value] of entries) {
    if (isRemoval(value)) {
      doc.delete(key);
      continue;
    }
    const isNew = !doc.has(key);
    doc.set(key, value);
    if (isNew && key === 'id' && isMap(doc.contents)) {
      const items = doc.contents.items;
      const added = items.pop();
      if (added) items.unshift(added);
    }
  }
  if (isMap(doc.contents) && doc.contents.items.length === 0) return '';
  return doc.toString(PRINT).trimEnd();
}

/**
 * Gives a page an `id` (and `created`) if it has none, for the first time
 * BenchWork saves it. Never called just from opening or indexing a page.
 */
export function ensureId(page: ParsedPage, newId: () => string, now: () => string): ParsedPage {
  if (page.meta.id !== null || page.error !== null) return page;
  return updateMeta(page, { id: newId(), ...(page.meta.created ? {} : { created: now() }) });
}

/** The current time as ISO 8601 with the local offset, such as 2026-10-22T10:30:00+01:00. */
export function localTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return (
    `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  );
}
