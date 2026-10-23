import { parentVaultPath, type PageRef } from '../platform';
import { withoutRecordEnding } from '../records/records';
import { linkKey } from '../search/extract';

/**
 * Which page a wiki link means, and what to write to link to a page. The
 * rules follow Obsidian: `[[Name]]` matches a page with that name,
 * `[[Folder/Name]]` a page whose path ends that way. If several match, the
 * one nearest the linking page wins.
 */

/** Keys a link can use to mean this page: every ending of its path. */
export function suffixKeys(path: string): string[] {
  const parts = linkKey(path).split('/');
  return parts.map((_, i) => parts.slice(i).join('/'));
}

function matches(page: PageRef, key: string): boolean {
  const own = linkKey(page.path);
  return own === key || own.endsWith(`/${key}`);
}

function topFolder(path: string): string {
  const i = path.indexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

/** Pages a link target could mean, nearest to `source` first. */
export function candidates(
  target: string,
  source: string | null,
  pages: readonly PageRef[],
): PageRef[] {
  const key = linkKey(target);
  if (key === '') return [];
  const found = pages.filter((p) => matches(p, key));
  if (found.length < 2) return found;
  const folder = source === null ? null : (parentVaultPath(source) ?? '');
  const top = source === null ? null : topFolder(source);
  const rank = (p: PageRef) => [
    folder !== null && (parentVaultPath(p.path) ?? '') === folder ? 0 : 1,
    top !== null && topFolder(p.path) === top ? 0 : 1,
    p.path.split('/').length,
    p.path.length,
  ];
  return [...found].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i += 1) {
      const d = (ra[i] ?? 0) - (rb[i] ?? 0);
      if (d !== 0) return d;
    }
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
}

/** The page a link in `source` means, or null if there is none yet. */
export function resolveLink(
  target: string,
  source: string | null,
  pages: readonly PageRef[],
): PageRef | null {
  return candidates(target, source, pages)[0] ?? null;
}

/**
 * What to write between `[[` and `]]` to link to `path`: its name if no
 * other page has that name, otherwise as much of its path as it takes to
 * make it unique. Never includes `.md` or a record's `.<kind>.yaml`.
 */
export function linkTargetFor(path: string, pages: readonly PageRef[]): string {
  const parts = withoutRecordEnding(path.replace(/\.md$/i, '')).split('/');
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const target = parts.slice(i).join('/');
    const key = linkKey(target);
    if (pages.filter((p) => matches(p, key)).length <= 1) return target;
  }
  return parts.join('/');
}

/** Pages whose title matches what was typed, best first, for the `[[` menu. */
export function suggestPages(query: string, pages: readonly PageRef[], limit = 8): PageRef[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [...pages].sort((a, b) => a.title.localeCompare(b.title)).slice(0, limit);
  }
  const scored: { page: PageRef; score: number }[] = [];
  for (const page of pages) {
    const title = page.title.toLowerCase();
    const path = page.path.toLowerCase();
    if (!words.every((w) => title.includes(w) || path.includes(w))) continue;
    const q = query.trim().toLowerCase();
    const score =
      title === q
        ? 0
        : title.startsWith(q)
          ? 1
          : words.every((w) => title.split(/\s+/).some((t) => t.startsWith(w)))
            ? 2
            : words.every((w) => title.includes(w))
              ? 3
              : 4;
    scored.push({ page, score });
  }
  return scored
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.page.title.length - b.page.title.length ||
        a.page.title.localeCompare(b.page.title),
    )
    .slice(0, limit)
    .map((s) => s.page);
}
