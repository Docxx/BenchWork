import { isMap, parseDocument } from 'yaml';
import { baseName } from '../platform';

/**
 * Records are small YAML files that describe something, named
 * `<name>.<kind>.yaml`: `climbing-day7.dataset.yaml` is a dataset record
 * called `climbing-day7`, and `[[climbing-day7]]` links to it. The core
 * indexes and links any record; a module may show a kind in its own way.
 * Values are edited in place, keeping comments and key order.
 */

const RECORD = /\.([a-z][a-z0-9-]*)\.ya?ml$/i;

/** A record's kind, such as `dataset`, or null if the name is not a record's. */
export function recordKind(name: string): string | null {
  const m = RECORD.exec(baseName(name));
  if (!m || m.index === 0) return null;
  return (m[1] ?? '').toLowerCase();
}

export function isRecord(name: string): boolean {
  return recordKind(name) !== null;
}

/** A record's name without its `.<kind>.yaml` ending; other names as they are. */
export function recordName(name: string): string {
  const base = baseName(name);
  const m = RECORD.exec(base);
  return m && m.index > 0 ? base.slice(0, m.index) : base;
}

/** A path without a record's `.<kind>.yaml` ending, as links write it. */
export function withoutRecordEnding(path: string): string {
  const name = baseName(path);
  const m = RECORD.exec(name);
  return m && m.index > 0 ? path.slice(0, path.length - name.length + m.index) : path;
}

/** The file name for a new record. */
export function recordFileName(name: string, kind: string): string {
  return `${name}.${kind}.yaml`;
}

export interface ParsedRecord {
  data: Record<string, unknown>;
  /** Why the file could not be read; it is then never written over. */
  error: string | null;
}

export function parseRecord(text: string): ParsedRecord {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) return { data: {}, error: doc.errors[0]?.message ?? 'Invalid YAML' };
  if (doc.contents === null) return { data: {}, error: null };
  if (!isMap(doc.contents)) return { data: {}, error: 'The file is not a list of keys' };
  return { data: doc.toJS() as Record<string, unknown>, error: null };
}

/**
 * Returns the record's text with some top-level keys set; `null` or
 * `undefined` removes one. Every other key and comment stays. Refuses a
 * file that could not be read.
 */
export function updateRecord(text: string, changes: Record<string, unknown>): string {
  const doc = parseDocument(text);
  if (doc.errors.length > 0 || (doc.contents !== null && !isMap(doc.contents))) {
    throw new Error('The record could not be read, so it was left alone');
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined) doc.delete(key);
    else doc.set(key, value);
  }
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}

const WIKI = /\[\[([^[\]\n|#^]+)(?:[#^][^[\]\n|]*)?(?:\|[^[\]\n]+)?\]\]/g;

/** Keys every page and record has, which are not shown or searched as text. */
const QUIET_KEYS = new Set(['id', 'type', 'created', 'modified', 'tags']);

/** Every string, number and boolean in a value, depth first. */
function scalars(value: unknown, out: string[]): void {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'number' || typeof value === 'boolean') out.push(String(value));
  else if (value instanceof Date) out.push(value.toISOString().slice(0, 10));
  else if (Array.isArray(value)) for (const v of value) scalars(v, out);
  else if (typeof value === 'object' && value !== null) {
    for (const v of Object.values(value)) scalars(v, out);
  }
}

/** The values of properties, as text to search, one property per line. */
export function propertyText(data: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (QUIET_KEYS.has(key)) continue;
    const parts: string[] = [];
    scalars(value, parts);
    const text = parts
      .map((p) => p.replace(WIKI, (_, target: string) => target.trim()))
      .filter((p) => p.trim() !== '')
      .join(', ');
    if (text !== '') lines.push(text);
  }
  return lines.join('\n');
}

/** Targets of `[[links]]` written in property values. */
export function propertyLinks(data: Record<string, unknown>): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (!QUIET_KEYS.has(key)) scalars(value, parts);
  }
  return parts.flatMap((p) => [...p.matchAll(WIKI)].map((m) => (m[1] ?? '').trim()));
}
