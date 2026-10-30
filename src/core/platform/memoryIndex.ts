import { PlatformError } from './errors';
import {
  MATCH_END,
  MATCH_START,
  type IndexEntry,
  type IndexedPage,
  type LinkRef,
  type PageRef,
  type SearchHit,
  type SearchIndex,
  type TagCount,
} from './types';

/**
 * A simple search index for tests and Playwright runs, kept per vault for
 * the life of the adapter. It follows the same query rules as the SQLite
 * one (every word, word starts, "quoted phrases", accents ignored, titles
 * first) without trying to match its ranking exactly.
 */

/** Byte order, like SQLite's default. */
function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Same rule as `tag_key` in src-tauri/src/index.rs. */
function tagKey(tag: string): string {
  return tag.trim().replace(/^#+/, '').toLowerCase();
}

/** Lower case, accents removed. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function words(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== '');
}

type Term = { kind: 'prefix'; word: string } | { kind: 'phrase'; words: string[] };

/** Same rules as `fts_query` in src-tauri/src/index.rs. */
export function parseQuery(input: string): Term[] {
  const terms: Term[] = [];
  input.split('"').forEach((chunk, i) => {
    const found = words(chunk);
    if (found.length === 0) return;
    if (i % 2 === 1) terms.push({ kind: 'phrase', words: found });
    else terms.push(...found.map((word) => ({ kind: 'prefix' as const, word })));
  });
  return terms;
}

function count(field: readonly string[], term: Term): number {
  if (term.kind === 'prefix') return field.filter((w) => w.startsWith(term.word)).length;
  let n = 0;
  for (let i = 0; i + term.words.length <= field.length; i += 1) {
    if (term.words.every((w, j) => field[i + j] === w)) n += 1;
  }
  return n;
}

function snippet(body: string, terms: readonly Term[]): string {
  const pieces = body.split(/\s+/).filter((p) => p !== '');
  const hits = new Set(terms.flatMap((t) => (t.kind === 'prefix' ? [t.word] : t.words)));
  const isHit = (piece: string) => words(piece).some((w) => [...hits].some((h) => w.startsWith(h)));
  const first = Math.max(0, pieces.findIndex(isHit));
  const start = Math.max(0, first - 8);
  const end = Math.min(pieces.length, first + 8);
  const text = pieces
    .slice(start, end)
    .map((p) => (isHit(p) ? `${MATCH_START}${p}${MATCH_END}` : p))
    .join(' ');
  return `${start > 0 ? '…' : ''}${text}${end < pieces.length ? '…' : ''}`;
}

export class MemoryIndex implements SearchIndex {
  private readonly vaults = new Map<string, Map<string, IndexedPage>>();
  private openPages: Map<string, IndexedPage> | null = null;

  constructor(private readonly root: () => string | null) {}

  private current(): Map<string, IndexedPage> {
    if (!this.openPages) throw new PlatformError('NoVault', 'The search index is not open');
    return this.openPages;
  }

  open(): Promise<{ fresh: boolean }> {
    const root = this.root();
    if (root === null) return Promise.reject(new PlatformError('NoVault', 'No vault is open'));
    let pages = this.vaults.get(root);
    const fresh = pages === undefined;
    if (!pages) {
      pages = new Map();
      this.vaults.set(root, pages);
    }
    this.openPages = pages;
    return Promise.resolve({ fresh });
  }

  close(): Promise<void> {
    this.openPages = null;
    return Promise.resolve();
  }

  entries(): Promise<IndexEntry[]> {
    return this.run(() =>
      [...this.current().values()]
        .map((p) => ({ path: p.path, mtime: p.mtime, size: p.size }))
        .sort((a, b) => (a.path < b.path ? -1 : 1)),
    );
  }

  apply(upserts: readonly IndexedPage[], removes: readonly string[]): Promise<void> {
    return this.run(() => {
      const pages = this.current();
      for (const path of removes) {
        for (const key of [...pages.keys()]) {
          if (key === path || key.startsWith(`${path}/`)) pages.delete(key);
        }
      }
      for (const page of upserts) pages.set(page.path, structuredClone(page));
    });
  }

  clear(): Promise<void> {
    return this.run(() => {
      this.current().clear();
    });
  }

  search(query: string, limit: number): Promise<SearchHit[]> {
    return this.run(() => {
      const terms = parseQuery(query);
      if (terms.length === 0) return [];
      const scored: { hit: SearchHit; score: number }[] = [];
      for (const page of this.current().values()) {
        const title = words(page.title);
        const tags = words(page.tags.join(' '));
        const body = words(page.body);
        let score = 0;
        let all = true;
        for (const term of terms) {
          const s = count(title, term) * 10 + count(tags, term) * 5 + count(body, term);
          if (s === 0) all = false;
          score += s;
        }
        if (!all) continue;
        scored.push({
          hit: { path: page.path, title: page.title, snippet: snippet(page.body, terms) },
          score,
        });
      }
      return scored
        .sort((a, b) => b.score - a.score || (a.hit.path < b.hit.path ? -1 : 1))
        .slice(0, limit)
        .map((s) => s.hit);
    });
  }

  backlinks(keys: readonly string[]): Promise<LinkRef[]> {
    return this.run(() => {
      const found = new Map<string, LinkRef>();
      for (const page of this.current().values()) {
        for (const link of page.links) {
          if (!keys.includes(link.key)) continue;
          found.set(`${page.path}\n${link.target}`, { source: page.path, target: link.target });
        }
      }
      return [...found.values()].sort(
        (a, b) => byText(a.source, b.source) || byText(a.target, b.target),
      );
    });
  }

  pages(): Promise<PageRef[]> {
    return this.run(() =>
      [...this.current().values()]
        .map((p) => ({ path: p.path, title: p.title, id: p.id, type: p.type, mtime: p.mtime }))
        .sort((a, b) => byText(a.path, b.path)),
    );
  }

  tags(): Promise<TagCount[]> {
    return this.run(() => {
      const counts = new Map<string, { tag: string; paths: Set<string> }>();
      for (const page of this.current().values()) {
        for (const tag of page.tags) {
          const key = tagKey(tag);
          const entry = counts.get(key) ?? { tag, paths: new Set<string>() };
          entry.paths.add(page.path);
          counts.set(key, entry);
        }
      }
      return [...counts.entries()]
        .sort(([a], [b]) => byText(a, b))
        .map(([, { tag, paths }]) => ({ tag, count: paths.size }));
    });
  }

  tagged(tag: string, limit: number): Promise<SearchHit[]> {
    return this.run(() => {
      const key = tagKey(tag);
      if (key === '') return [];
      return [...this.current().values()]
        .filter((p) =>
          p.tags.some((t) => {
            const k = tagKey(t);
            return k === key || k.startsWith(`${key}/`);
          }),
        )
        .sort((a, b) => byText(a.title, b.title) || byText(a.path, b.path))
        .slice(0, limit)
        .map((p) => ({ path: p.path, title: p.title, snippet: '' }));
    });
  }

  private run<T>(fn: () => T): Promise<T> {
    try {
      return Promise.resolve(fn());
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
