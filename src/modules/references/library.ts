import type { CitationChoice, CitedWork } from '@core/api';

/**
 * The reference library: a CSL JSON file that Better BibTeX (a Zotero
 * plugin) keeps up to date in the vault. Each item's citation key is the
 * `[@key]` written in pages.
 */

export interface Person {
  family: string;
  given: string;
}

export interface Reference {
  key: string;
  title: string;
  authors: Person[];
  /** Four digits, or null if the item has no date. */
  year: string | null;
  /** Journal, book or website the work appeared in. */
  container: string;
  doi: string;
  url: string;
  pdfUrl?: string;
  /** Keywords and tags, from the file's `keyword` and `tags` and from Zotero. */
  subjects?: string[];
  abstract?: string;
  /** Zotero collection keys, when the library came from a Zotero account. */
  collections?: string[];
  /** Zotero tags from a Zotero account, with the file's keywords and tags. Same as subjects. */
  tags?: string[];
  /** When it was added to Zotero, as an ISO date. */
  added?: string;
  /** The item's key in Zotero, when known. */
  zoteroKey?: string;
}

/** A Zotero collection; `parent` is another collection's key, or null at the top. */
export interface Collection {
  key: string;
  name: string;
  parent: string | null;
}

export interface Library {
  refs: Map<string, Reference>;
  collections: Collection[];
  /** Why the file could not be read, or null. Items it could not use are skipped. */
  error: string | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

/** Text without the markup Zotero and Better BibTeX leave in titles, such as `<span class="nocase">`. */
function plain(value: unknown): string {
  return text(value)
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ');
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    : [];
}

function collectionsOf(value: unknown): Collection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw: unknown) => {
    if (typeof raw !== 'object' || raw === null) return [];
    const c = raw as Record<string, unknown>;
    const key = text(c['key']);
    const name = text(c['name']);
    const parent = text(c['parent']);
    return key && name ? [{ key, name, parent: parent || null }] : [];
  });
}

function person(value: unknown): Person | null {
  if (typeof value !== 'object' || value === null) return null;
  const p = value as Record<string, unknown>;
  const family = text(p['family']) || text(p['literal']);
  return family === '' ? null : { family, given: text(p['given']) };
}

function yearOf(issued: unknown): string | null {
  if (typeof issued !== 'object' || issued === null) return null;
  const d = issued as Record<string, unknown>;
  const parts = d['date-parts'];
  if (Array.isArray(parts) && Array.isArray(parts[0])) {
    const year = text((parts[0] as unknown[])[0]);
    if (/^\d{4}$/.test(year)) return year;
  }
  return /\b(\d{4})\b/.exec(text(d['raw']) || text(d['literal']))?.[1] ?? null;
}

/** Reads a CSL JSON library, such as Better BibTeX's "Better CSL JSON" export. */
export function parseLibrary(source: string): Library {
  const refs = new Map<string, Reference>();
  let items: unknown;
  let collections: Collection[] = [];
  try {
    items = JSON.parse(source);
  } catch {
    return { refs, collections, error: 'The library file is not valid JSON.' };
  }
  // Some exports, and BenchWork's copy of a Zotero account, wrap the list as { items: [...] }.
  if (!Array.isArray(items) && typeof items === 'object' && items !== null) {
    collections = collectionsOf((items as Record<string, unknown>)['collections']);
    items = (items as Record<string, unknown>)['items'];
  }
  if (!Array.isArray(items)) {
    return {
      refs,
      collections,
      error: 'The library file is not a CSL JSON list of references.',
    };
  }
  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) continue;
    const item = raw as Record<string, unknown>;
    const key = text(item['citation-key']) || text(item['citationKey']) || text(item['id']);
    if (key === '' || /\s/.test(key)) continue;
    const people = Array.isArray(item['author'])
      ? item['author']
      : Array.isArray(item['editor'])
        ? item['editor']
        : [];
    const attachment = Array.isArray(item['attachments'])
      ? item['attachments'].find((entry: unknown): entry is Record<string, unknown> => {
          if (!entry || typeof entry !== 'object') return false;
          const data = entry as Record<string, unknown>;
          return (
            /^https:\/\//i.test(text(data['url'])) &&
            (data['contentType'] === 'application/pdf' ||
              /\.pdf(?:[?#]|$)/i.test(text(data['url'])))
          );
        })
      : undefined;
    const subjects = new Set<string>();
    for (const field of [item['keyword'], item['tags'], item['zotero-tags']]) {
      const entries: unknown[] = Array.isArray(field) ? field : text(field).split(/[,;]/);
      for (const entry of entries) {
        const label =
          typeof entry === 'string'
            ? entry.trim()
            : entry && typeof entry === 'object' && 'tag' in entry
              ? text(entry.tag)
              : '';
        if (label) subjects.add(label);
      }
    }
    refs.set(key, {
      ...(subjects.size ? { subjects: [...subjects], tags: [...subjects] } : {}),
      key,
      title: plain(item['title']),
      authors: people.map(person).filter((p): p is Person => p !== null),
      year: yearOf(item['issued']),
      container: text(item['container-title']),
      doi: text(item['DOI']),
      url: text(item['URL']),
      ...(attachment ? { pdfUrl: text(attachment['url']) } : {}),
      ...(plain(item['abstract']) ? { abstract: plain(item['abstract']) } : {}),
      ...(Array.isArray(item['zotero-collections'])
        ? { collections: strings(item['zotero-collections']) }
        : {}),
      ...(text(item['zotero-added']) ? { added: text(item['zotero-added']) } : {}),
      ...(text(item['zotero-key']) ? { zoteroKey: text(item['zotero-key']) } : {}),
    });
  }
  return { refs, collections, error: null };
}

/** `Smith 2024`, `Smith and Lee 2024`, `Smith et al. 2024`, or the title without authors. */
export function shortLabel(ref: Reference): string {
  const [first, second] = ref.authors;
  const who =
    first === undefined
      ? ref.title.length > 30
        ? `${ref.title.slice(0, 30).trimEnd()}…`
        : ref.title || ref.key
      : ref.authors.length === 1 || second === undefined
        ? first.family
        : ref.authors.length === 2
          ? `${first.family} and ${second.family}`
          : `${first.family} et al.`;
  return `${who} ${ref.year ?? 'n.d.'}`;
}

function initials(given: string): string {
  return given
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((g) => `${g[0] ?? ''}.`)
    .join(' ');
}

/** A plain full reference: `Smith, A., Lee, B. (2024). Title. Journal. doi:10.1/x` */
export function fullReference(ref: Reference): string {
  const names = ref.authors
    .map((p) => (p.given ? `${p.family}, ${initials(p.given)}` : p.family))
    .join(', ');
  const parts = [
    `${names || 'Anonymous'} (${ref.year ?? 'n.d.'}).`,
    ref.title ? `${ref.title.replace(/\.$/, '')}.` : '',
    ref.container ? `${ref.container}.` : '',
    ref.doi ? `doi:${ref.doi}` : ref.url,
  ];
  return parts.filter((p) => p !== '').join(' ');
}

export function describe(ref: Reference): CitedWork {
  return { short: shortLabel(ref), full: fullReference(ref) };
}

/** Lower case, accents removed, for matching what was typed. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

const WORD = /[^\p{L}\p{N}]+/u;

function words(query: string): string[] {
  return fold(query).replace(/^@/, '').split(WORD).filter(Boolean);
}

/**
 * How well a reference matches the typed words, or 0 if any word matches
 * nothing. Every word must match the key, an author, the year, the title,
 * the journal, the DOI or link, or the abstract; the earlier in that list,
 * the higher the score. The whole phrase in the title counts extra.
 */
export function scoreReference(ref: Reference, typed: readonly string[], phrase = ''): number {
  const key = fold(ref.key);
  const names = ref.authors.map((a) => fold(a.family));
  const title = fold(ref.title);
  const titleWords = [title, ...(ref.subjects ?? []).map(fold)].join(' ').split(WORD);
  const journal = fold(ref.container).split(WORD);
  const metadata = fold([ref.doi, ref.url, ...ref.authors.map((a) => a.given)].join(' ')).split(
    WORD,
  );
  let abstract: string[] | null = null;
  let score = 0;
  for (const w of typed) {
    if (key === w) score += 8;
    else if (key.startsWith(w)) score += 6;
    else if (names[0]?.startsWith(w)) score += 5;
    else if (names.some((n) => n.startsWith(w))) score += 4;
    else if (ref.year?.startsWith(w)) score += 4;
    else if (titleWords.some((t) => t.startsWith(w))) score += 3;
    else if (journal.some((t) => t.startsWith(w))) score += 2;
    else if (key.includes(w) || metadata.some((t) => t.startsWith(w))) score += 1;
    else if ((abstract ??= fold(ref.abstract ?? '').split(WORD)).some((t) => t.startsWith(w)))
      score += 0.5;
    else return 0;
  }
  if (phrase.includes(' ') && title.includes(phrase)) score += 3;
  return score;
}

const byNewest = (a: Reference, b: Reference) =>
  (b.year ?? '').localeCompare(a.year ?? '') || a.key.localeCompare(b.key);

/**
 * References for the `[@` menu. Every typed word must match (see
 * scoreReference); the best matches come first, then newer works.
 */
export function searchLibrary(
  refs: ReadonlyMap<string, Reference>,
  query: string,
  limit = 50,
): CitationChoice[] {
  const typed = words(query);
  const phrase = typed.join(' ');
  const scored: { ref: Reference; score: number }[] = [];
  for (const ref of refs.values()) {
    const score = typed.length ? scoreReference(ref, typed, phrase) : 1;
    if (score > 0) scored.push({ ref, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || byNewest(a.ref, b.ref))
    .slice(0, limit)
    .map(({ ref }) => ({ key: ref.key, label: shortLabel(ref), detail: ref.title || ref.key }));
}

/** Pseudo-collection for references in no collection. */
export const UNFILED = '*unfiled';

export interface LibraryFilter {
  text: string;
  /** A collection key (its sub-collections included), UNFILED, or null for all. */
  collection: string | null;
  tag: string | null;
  yearFrom: string;
  yearTo: string;
  journal: string;
}

export const NO_FILTER: LibraryFilter = {
  text: '',
  collection: null,
  tag: null,
  yearFrom: '',
  yearTo: '',
  journal: '',
};

export type LibrarySort = 'relevance' | 'author' | 'year' | 'title' | 'journal' | 'added';

/** A collection's key with all the keys beneath it. */
export function collectionAndBelow(collections: readonly Collection[], key: string): Set<string> {
  const keys = new Set([key]);
  for (let grew = true; grew;) {
    grew = false;
    for (const c of collections)
      if (c.parent && keys.has(c.parent) && !keys.has(c.key)) {
        keys.add(c.key);
        grew = true;
      }
  }
  return keys;
}

/**
 * The library page's list: references passing the filter, sorted. With
 * words typed and sort `relevance`, best matches first; otherwise the
 * chosen column, with ties broken by newest.
 */
export function findReferences(
  refs: ReadonlyMap<string, Reference>,
  collections: readonly Collection[],
  filter: LibraryFilter,
  sort: LibrarySort,
  descending = false,
): Reference[] {
  const typed = words(filter.text);
  const phrase = typed.join(' ');
  const inCollection =
    filter.collection && filter.collection !== UNFILED
      ? collectionAndBelow(collections, filter.collection)
      : null;
  const journal = fold(filter.journal.trim());
  const scored: { ref: Reference; score: number }[] = [];
  for (const ref of refs.values()) {
    if (filter.collection === UNFILED && ref.collections?.length) continue;
    if (inCollection && !ref.collections?.some((c) => inCollection.has(c))) continue;
    if (filter.tag && !ref.tags?.includes(filter.tag)) continue;
    if (filter.yearFrom && (!ref.year || ref.year < filter.yearFrom)) continue;
    if (filter.yearTo && (!ref.year || ref.year > filter.yearTo)) continue;
    if (journal && !fold(ref.container).includes(journal)) continue;
    const score = typed.length ? scoreReference(ref, typed, phrase) : 1;
    if (score > 0) scored.push({ ref, score });
  }
  const text = (r: Reference): string =>
    sort === 'author'
      ? (r.authors[0]?.family ?? r.title)
      : sort === 'title'
        ? r.title
        : sort === 'journal'
          ? r.container
          : sort === 'added'
            ? (r.added ?? '')
            : (r.year ?? '');
  const compare =
    sort === 'relevance'
      ? (a: { ref: Reference; score: number }, b: { ref: Reference; score: number }) =>
          b.score - a.score || byNewest(a.ref, b.ref)
      : (a: { ref: Reference; score: number }, b: { ref: Reference; score: number }) => {
          const x = text(a.ref);
          const y = text(b.ref);
          // Blanks always last, whichever way round.
          if (!x !== !y) return x ? -1 : 1;
          const order = fold(x).localeCompare(fold(y), undefined, { numeric: true });
          return (descending ? -order : order) || byNewest(a.ref, b.ref);
        };
  return scored.sort(compare).map(({ ref }) => ref);
}
