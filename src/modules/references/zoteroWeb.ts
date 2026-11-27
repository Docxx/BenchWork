import { parseLibrary, type Collection, type Reference } from './library';

/**
 * A Zotero account through the Zotero Web API (api.zotero.org), read only.
 * The API key travels as the `key` parameter, so plain https reads are
 * enough. Each sync asks only for what changed since the last one, and the
 * result is kept in the vault as `ZOTERO_LIBRARY`, a CSL JSON list with
 * Zotero's collections, tags and dates beside it, so citations work offline
 * and on every device.
 */

export const ZOTERO_API = 'https://api.zotero.org';
export const ZOTERO_LIBRARY = 'references/zotero-library.json';
/** Where people make a key. */
export const ZOTERO_KEYS_PAGE = 'https://www.zotero.org/settings/keys/new';
const PAGE = 100;

export type GetText = (url: string) => Promise<string>;

export interface ZoteroAccount {
  key: string;
  userId: string;
  username: string;
}

/** What BenchWork keeps in the vault, read back by parseLibrary. */
export interface ZoteroLibraryFile {
  source: 'zotero';
  userId: string;
  /** The library version this copy reached; the next sync asks for changes since it. */
  version: number;
  synced: string;
  collections: Collection[];
  items: Record<string, unknown>[];
}

function url(path: string, key: string, params: Record<string, string> = {}): string {
  const query = new URLSearchParams({ ...params, key });
  return `${ZOTERO_API}${path}?${query.toString()}`;
}

function json(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Zotero sent something unexpected. Try again later.');
  }
}

const record = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/** Checks a key with Zotero, and finds whose library it opens. */
export async function checkKey(get: GetText, key: string): Promise<ZoteroAccount> {
  const trimmed = key.trim();
  if (!/^[A-Za-z0-9]{24}$/.test(trimmed))
    throw new Error('That does not look like a Zotero key. Keys are 24 letters and numbers.');
  let text: string;
  try {
    text = await get(`${ZOTERO_API}/keys/${trimmed}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      /\b40[34]\b/.test(message)
        ? 'Zotero did not accept this key. Check it and try again.'
        : message,
    );
  }
  const info = record(json(text));
  const userId = str(info['userID']);
  const access = record(record(info['access'])['user']);
  if (!userId) throw new Error('Zotero did not say whose key this is.');
  if (access['library'] !== true)
    throw new Error('This key cannot read your library. Make a key with "Allow library access".');
  return { key: trimmed, userId, username: str(info['username']) };
}

/** Every page of a list, 100 at a time. */
async function pages(
  get: GetText,
  path: string,
  key: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  for (let start = 0; ; start += PAGE) {
    const page = json(
      await get(url(path, key, { ...params, limit: String(PAGE), start: String(start) })),
    );
    if (!Array.isArray(page)) throw new Error('Zotero sent something unexpected. Try again later.');
    all.push(...page.map(record));
    if (page.length < PAGE) return all;
  }
}

/** Lower case, accents and punctuation removed, for matching titles. */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/<[^>]*>/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const bareDoi = (doi: string) =>
  doi
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .toLowerCase();

/** A key in the style `Buchon2014-rs`, the same every time for the same item. */
export function makeKey(family: string, year: string, zoteroKey: string): string {
  const name =
    family
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^A-Za-z]/g, '') || 'Anon';
  let hash = 0;
  for (const c of zoteroKey) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const suffix = (letters[hash % 26] ?? 'a') + (letters[Math.floor(hash / 26) % 26] ?? 'a');
  return `${name[0]?.toUpperCase() ?? ''}${name.slice(1)}${year || 'nd'}-${suffix}`;
}

/**
 * Picks the citation key for a Zotero item, keeping keys already written in
 * pages: Zotero's own citation key field, then a "Citation Key:" line in
 * Extra, then the key this item had at the last sync, then the key of the
 * same work in the old library file (same DOI, or same title and year), and
 * only then a new one.
 */
export class KeyChooser {
  private readonly byDoi = new Map<string, string>();
  private readonly byTitle = new Map<string, string>();
  private readonly used = new Set<string>();

  constructor(
    private readonly previous: ReadonlyMap<string, string>,
    fallback: Iterable<Reference>,
  ) {
    for (const ref of fallback) {
      if (ref.doi) this.byDoi.set(bareDoi(ref.doi), ref.key);
      if (ref.title) this.byTitle.set(fold(ref.title) + '|' + (ref.year ?? ''), ref.key);
    }
  }

  /** Marks keys other items already hold. */
  reserve(key: string): void {
    this.used.add(key);
  }

  choose(data: Record<string, unknown>, year: string, family: string): string {
    const zoteroKey = str(data['key']);
    const own =
      str(data['citationKey']).trim() ||
      /^\s*Citation Key:\s*(\S+)/im.exec(str(data['extra']))?.[1] ||
      '';
    const doi = bareDoi(str(data['DOI']));
    const candidates = [
      own,
      this.previous.get(zoteroKey) ?? '',
      (doi && this.byDoi.get(doi)) || '',
      this.byTitle.get(fold(str(data['title'])) + '|' + year) ?? '',
    ];
    let key = candidates.find((k) => k !== '' && !/\s/.test(k) && !this.used.has(k));
    if (!key) {
      const base = makeKey(family, year, zoteroKey);
      key = base;
      for (let n = 2; this.used.has(key); n++) key = base + String(n);
    }
    this.used.add(key);
    return key;
  }
}

const SKIP = new Set(['attachment', 'note', 'annotation']);

/** Turns a Zotero item (data plus CSL JSON) into a line of the vault copy. */
function itemOf(raw: Record<string, unknown>, keys: KeyChooser): Record<string, unknown> | null {
  const data = record(raw['data']);
  if (SKIP.has(str(data['itemType'])) || data['deleted'] === true || data['deleted'] === 1)
    return null;
  const csl = record(raw['csljson']);
  const parts = record(csl['issued'])['date-parts'];
  const year =
    (Array.isArray(parts) && Array.isArray(parts[0]) ? str((parts[0] as unknown[])[0]) : '') ||
    (/\b(\d{4})\b/.exec(str(data['date']))?.[1] ?? '');
  const authors = Array.isArray(csl['author']) ? csl['author'] : [];
  const first = record(authors[0]);
  const family = str(first['family']) || str(first['literal']);
  const key = keys.choose(data, year, family);
  const tags = Array.isArray(data['tags']) ? data['tags'].map((t) => str(record(t)['tag'])) : [];
  return {
    ...csl,
    id: key,
    'citation-key': key,
    'zotero-key': str(data['key']),
    'zotero-collections': Array.isArray(data['collections']) ? data['collections'] : [],
    'zotero-tags': tags.filter(Boolean),
    'zotero-added': str(data['dateAdded']),
    'zotero-version': Number(data['version']) || 0,
  };
}

const versionOf = (raw: Record<string, unknown>) => Number(raw['version']) || 0;

/**
 * Brings the vault copy up to date: everything the first time, then only
 * what was added, changed or deleted since `previous.version`. `fallback`
 * is the old library file, for keeping its citation keys.
 */
export async function syncLibrary(
  get: GetText,
  account: ZoteroAccount,
  previous: ZoteroLibraryFile | null,
  fallback: Iterable<Reference>,
  now: Date = new Date(),
): Promise<ZoteroLibraryFile> {
  const base = previous?.userId === account.userId ? previous : null;
  const since = base?.version ?? 0;
  const user = `/users/${account.userId}`;
  const params = since ? { since: String(since) } : {};
  const [collectionsRaw, itemsRaw, deletedRaw] = await Promise.all([
    pages(get, `${user}/collections`, account.key, { ...params, format: 'json' }),
    pages(get, `${user}/items`, account.key, {
      ...params,
      format: 'json',
      include: 'data,csljson',
      itemType: '-attachment',
    }),
    since
      ? get(url(`${user}/deleted`, account.key, { since: String(since) })).then(
          (t) => record(json(t)),
          (): Record<string, unknown> => ({}),
        )
      : Promise.resolve({} as Record<string, unknown>),
  ]);
  const gone = (field: string) =>
    new Set(Array.isArray(deletedRaw[field]) ? deletedRaw[field].map(str) : []);
  const goneItems = gone('items');
  const goneCollections = gone('collections');

  // Collections: the old ones, changed ones replaced, deleted ones dropped.
  const collections = new Map((base?.collections ?? []).map((c) => [c.key, c]));
  for (const raw of collectionsRaw) {
    const data = record(raw['data']);
    const key = str(data['key']) || str(raw['key']);
    const parent = str(data['parentCollection']);
    if (key) collections.set(key, { key, name: str(data['name']), parent: parent || null });
  }
  for (const key of goneCollections) collections.delete(key);

  // Items: as for collections, keeping each item's citation key.
  const previousKeys = new Map<string, string>();
  const items = new Map<string, Record<string, unknown>>();
  for (const item of base?.items ?? []) {
    const zoteroKey = str(item['zotero-key']);
    if (!zoteroKey) continue;
    previousKeys.set(zoteroKey, str(item['citation-key']));
    items.set(zoteroKey, item);
  }
  const changed = new Set(itemsRaw.map((raw) => str(record(raw['data'])['key'])));
  for (const key of [...changed, ...goneItems]) items.delete(key);
  const chooser = new KeyChooser(previousKeys, fallback);
  for (const item of items.values()) chooser.reserve(str(item['citation-key']));
  for (const raw of itemsRaw) {
    const item = itemOf(raw, chooser);
    if (item) items.set(str(item['zotero-key']), item);
  }

  const version = Math.max(
    since,
    ...collectionsRaw.map(versionOf),
    ...itemsRaw.map(versionOf),
    ...[...items.values()].map((i) => Number(i['zotero-version']) || 0),
  );
  return {
    source: 'zotero',
    userId: account.userId,
    version,
    synced: now.toISOString(),
    collections: [...collections.values()].sort((a, b) => a.name.localeCompare(b.name)),
    items: [...items.values()],
  };
}

/** Reads the vault copy back, or null if it is missing or not one. */
export function readLibraryFile(text: string | null): ZoteroLibraryFile | null {
  if (text === null) return null;
  try {
    const data = record(JSON.parse(text));
    if (data['source'] !== 'zotero' || !Array.isArray(data['items'])) return null;
    return {
      source: 'zotero',
      userId: str(data['userId']),
      version: Number(data['version']) || 0,
      synced: str(data['synced']),
      collections: parseLibrary(text).collections,
      items: data['items'].map(record),
    };
  } catch {
    return null;
  }
}
