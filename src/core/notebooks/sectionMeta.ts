import { isMap, parseDocument } from 'yaml';

/**
 * `_section.yaml`: optional settings for a notebook or section folder. It
 * holds the folder's colour and icon, how what is inside it is sorted, and
 * its own order for it. Keys this version does not know are kept when it
 * is saved.
 */

export const SECTION_FILE = '_section.yaml';

/** Colours offered in the menu. Any CSS colour in the file also works. */
export const SECTION_COLOURS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'grey',
] as const;

export type SectionColour = (typeof SECTION_COLOURS)[number];

/** How a folder's contents are sorted: its own order, by name either way, or last changed first. */
export type FolderSort = 'manual' | 'name' | 'name-desc' | 'changed';
export const FOLDER_SORTS: readonly FolderSort[] = ['manual', 'name', 'name-desc', 'changed'];

export interface SectionMeta {
  colour: string | null;
  /** An emoji or a short symbol shown beside the folder's name. */
  icon: string | null;
  sort: FolderSort;
  /** File and folder names in the order to show them; others follow, sorted. */
  order: string[];
}

export function emptySectionMeta(): SectionMeta {
  return { colour: null, icon: null, sort: 'manual', order: [] };
}

const SAFE_COLOUR = /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i;

/** Never throws: a file that cannot be read counts as empty. */
export function parseSectionMeta(text: string): SectionMeta {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) return emptySectionMeta();
  const data: unknown = doc.toJS();
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return emptySectionMeta();
  const record = data as Record<string, unknown>;

  const colourValue = record['colour'];
  const colour =
    typeof colourValue === 'string' && SAFE_COLOUR.test(colourValue.trim())
      ? colourValue.trim()
      : null;
  const orderValue = record['order'];
  const order = Array.isArray(orderValue)
    ? [...new Set(orderValue.filter((n): n is string => typeof n === 'string' && n !== ''))]
    : [];
  const iconValue = record['icon'];
  const icon =
    typeof iconValue === 'string' && iconValue.trim() !== '' && iconValue.trim().length <= 16
      ? iconValue.trim()
      : null;
  const sortValue = record['sort'];
  const sort = (FOLDER_SORTS as readonly unknown[]).includes(sortValue)
    ? (sortValue as FolderSort)
    : 'manual';
  return { colour, icon, sort, order };
}

/**
 * Writes `meta` into the existing file text (or a new file), keeping other
 * keys and comments. Returns null when nothing is left to store, so the
 * caller can leave the file out.
 */
export function serialiseSectionMeta(existing: string | null, meta: SectionMeta): string | null {
  let doc = parseDocument(existing ?? '');
  if (doc.errors.length > 0 || (doc.contents !== null && !isMap(doc.contents))) {
    // A broken file is replaced; it only ever held colour and order.
    doc = parseDocument('');
  }
  const remove = (key: string) => {
    if (isMap(doc.contents)) doc.delete(key);
  };
  if (meta.colour === null) remove('colour');
  else doc.set('colour', meta.colour);
  if (meta.icon === null) remove('icon');
  else doc.set('icon', meta.icon);
  if (meta.sort === 'manual') remove('sort');
  else doc.set('sort', meta.sort);
  if (meta.order.length === 0) remove('order');
  else doc.set('order', meta.order);

  if (!isMap(doc.contents) || doc.contents.items.length === 0) return null;
  return doc.toString({ lineWidth: 0, flowCollectionPadding: false });
}

/** Moves `name` in an order list to `index`, adding it if missing. */
export function placeInOrder(order: readonly string[], name: string, index: number): string[] {
  const rest = order.filter((n) => n !== name);
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), name, ...rest.slice(at)];
}

/** Replaces `from` with `to` in an order list, keeping its place. */
export function renameInOrder(order: readonly string[], from: string, to: string): string[] {
  return order.map((n) => (n === from ? to : n)).filter((n, i, all) => all.indexOf(n) === i);
}
