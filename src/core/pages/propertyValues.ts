import type { PropertyField, PropertyKind } from '../api';

/**
 * How page properties are shown and edited: which rows the Properties panel
 * has, and how values move between YAML and the fields. Values are written
 * the way Obsidian writes them, so the files read well in both.
 */

/**
 * Kept out of the Properties panel: keys the core looks after, the
 * `description` shown under the title, and the `layout` set from the top bar.
 */
export const QUIET_PROPERTIES = new Set([
  'id',
  'type',
  'created',
  'modified',
  'tags',
  'description',
  'layout',
]);

export interface PropertyRow extends PropertyField {
  value: unknown;
  /** True for a key the page's type does not define, which can be removed. */
  extra: boolean;
}

const WHOLE_LINK = /^\s*\[\[([^[\]\n]+)\]\]\s*$/;

function isLinkText(value: unknown): value is string {
  return typeof value === 'string' && WHOLE_LINK.test(value);
}

/** The kind of a property no page type defines, guessed from its value. */
export function guessKind(value: unknown): PropertyKind {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every(isLinkText) ? 'links' : 'list';
  }
  if (isLinkText(value)) return 'link';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
  return 'text';
}

/** `cell_line` or `cellLine` as "Cell line". */
export function labelFor(key: string): string {
  const words = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The panel's rows: the type's fields in order, then the page's other keys. */
export function propertyRows(
  properties: Readonly<Record<string, unknown>>,
  fields: readonly PropertyField[],
): PropertyRow[] {
  const defined = new Set(fields.map((f) => f.key));
  const rows: PropertyRow[] = fields.map((f) => ({ ...f, value: properties[f.key], extra: false }));
  for (const [key, value] of Object.entries(properties)) {
    if (defined.has(key) || QUIET_PROPERTIES.has(key)) continue;
    rows.push({ key, label: labelFor(key), kind: guessKind(value), value, extra: true });
  }
  return rows;
}

/** A value as plain text, such as for a text field. */
export function textOf(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(textOf).join(', ');
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** The items of a list value; a single value is a list of one. */
export function listOf(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
  return raw.map(textOf).filter((v) => v.trim() !== '');
}

/** What a typed list becomes: comma-separated items, trimmed. */
export function parseList(text: string): string[] {
  return text
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '');
}

/** The link targets in a link or links value: `[[a]]` gives `a`. */
export function linkTargets(value: unknown): string[] {
  return listOf(value)
    .map((v) => WHOLE_LINK.exec(v)?.[1]?.trim() ?? v.trim())
    .filter((v) => v !== '');
}

/** Link targets as the value to store: `[[a]]` for `link`, a list for `links`. */
export function linkValue(targets: readonly string[], kind: 'link' | 'links'): unknown {
  const links = targets.map((t) => `[[${t}]]`);
  if (kind === 'link') return links[0] ?? null;
  return links;
}

/** A value as stored for a field kind, from what was typed; null removes it. */
export function valueFromText(kind: PropertyKind, text: string): unknown {
  const trimmed = text.trim();
  switch (kind) {
    case 'list':
      return parseList(text);
    case 'link':
      return trimmed === '' ? null : linkValue([trimmed.replace(/^\[\[|\]\]$/g, '')], 'link');
    case 'links':
      return linkValue(
        parseList(text).map((t) => t.replace(/^\[\[|\]\]$/g, '')),
        'links',
      );
    default:
      return trimmed === '' ? null : trimmed;
  }
}

/** Whether a name can be a new property's key. */
export function isPropertyKey(name: string): boolean {
  const key = name.trim();
  return key !== '' && !QUIET_PROPERTIES.has(key) && !/[:#[\]{}]/.test(key);
}
