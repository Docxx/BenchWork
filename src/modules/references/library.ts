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
}

export interface Library {
  refs: Map<string, Reference>;
  /** Why the file could not be read, or null. Items it could not use are skipped. */
  error: string | null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
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
  try {
    items = JSON.parse(source);
  } catch {
    return { refs, error: 'The library file is not valid JSON.' };
  }
  // Some exports wrap the list as { items: [...] }.
  if (!Array.isArray(items) && typeof items === 'object' && items !== null) {
    items = (items as Record<string, unknown>)['items'];
  }
  if (!Array.isArray(items)) {
    return { refs, error: 'The library file is not a CSL JSON list of references.' };
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
    refs.set(key, {
      key,
      title: text(item['title']),
      authors: people.map(person).filter((p): p is Person => p !== null),
      year: yearOf(item['issued']),
      container: text(item['container-title']),
      doi: text(item['DOI']),
      url: text(item['URL']),
    });
  }
  return { refs, error: null };
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

/**
 * References for the `[@` menu. Every typed word must match the key, an
 * author's surname, the year or a title word. Keys that start with the
 * words come first, then first authors, other authors, and newer works.
 */
export function searchLibrary(
  refs: ReadonlyMap<string, Reference>,
  query: string,
  limit = 8,
): CitationChoice[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const scored: { ref: Reference; score: number }[] = [];
  for (const ref of refs.values()) {
    const key = fold(ref.key);
    const names = ref.authors.map((a) => fold(a.family));
    const titleWords = fold(ref.title).split(/[^\p{L}\p{N}]+/u);
    let score = 0;
    let all = true;
    for (const w of words) {
      if (key.startsWith(w)) score += 4;
      else if (names[0]?.startsWith(w)) score += 3;
      else if (names.some((n) => n.startsWith(w))) score += 2;
      else if (ref.year?.startsWith(w)) score += 2;
      else if (titleWords.some((t) => t.startsWith(w))) score += 1;
      else if (key.includes(w)) score += 1;
      else {
        all = false;
        break;
      }
    }
    if (all) scored.push({ ref, score });
  }
  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.ref.year ?? '').localeCompare(a.ref.year ?? '') ||
        a.ref.key.localeCompare(b.ref.key),
    )
    .slice(0, limit)
    .map(({ ref }) => ({ key: ref.key, label: shortLabel(ref), detail: ref.title || ref.key }));
}
