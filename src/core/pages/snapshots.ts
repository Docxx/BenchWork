import { joinVaultPath, PlatformError, type PlatformAdapter } from '../platform';
import { VAULT_DIR } from '../vault/vaultConfig';

/**
 * Recovery copies of pages, in `.benchwork/snapshots/<page>/<time>.md`.
 * BenchWork saves one before it replaces a version of a page that would
 * otherwise be lost, such as when edits clash with a change made elsewhere.
 * They are BenchWork's own files; the page itself is never touched.
 */

export const SNAPSHOT_DIR = `${VAULT_DIR}/snapshots`;

/** The folder for a page's snapshots: its id if it has one, else its path. */
export function snapshotFolder(pagePath: string, pageId: string | null): string {
  const key = pageId ?? pagePath.replace(/\//g, ' ~ ');
  return joinVaultPath(SNAPSHOT_DIR, key);
}

/** `2026-10-22 103005`, safe in file names on every system. */
export function snapshotStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** Saves `text` as a snapshot of the page and returns the snapshot's path. */
export async function saveSnapshot(
  platform: PlatformAdapter,
  pagePath: string,
  pageId: string | null,
  text: string,
  now: Date = new Date(),
): Promise<string> {
  const folder = snapshotFolder(pagePath, pageId);
  await platform.ensureDir(folder);
  const stamp = snapshotStamp(now);
  for (let n = 1; n < 100; n += 1) {
    const path = joinVaultPath(folder, n === 1 ? `${stamp}.md` : `${stamp} ${String(n)}.md`);
    try {
      await platform.createNew(path, text);
      return path;
    } catch (err) {
      if (PlatformError.from(err).kind !== 'AlreadyExists') throw err;
    }
  }
  throw new Error('Could not find a free name for the snapshot');
}
