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

/** Automatic snapshots of a page are at least this far apart. */
export const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;
/** Snapshots kept per page at most. */
export const KEEP_LATEST = 50;
/** Snapshots older than this are dropped... */
export const KEEP_DAYS = 60;
/** ...except the newest few, which are always kept. */
export const ALWAYS_KEEP = 5;

export interface SnapshotRef {
  path: string;
  /** When it was taken, read from its name. */
  time: Date;
}

/** Reads the time from a snapshot's name, such as `2026-10-22 103005 2.md`. */
export function parseStamp(name: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})(\d{2})(\d{2})(?: \d+)?\.md$/.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, s ?? 0);
}

async function listFolder(platform: PlatformAdapter, folder: string): Promise<SnapshotRef[]> {
  if (!(await platform.exists(folder))) return [];
  const refs: SnapshotRef[] = [];
  for (const entry of await platform.listDir(folder)) {
    const time = entry.isDir ? null : parseStamp(entry.name);
    if (time !== null) refs.push({ path: entry.path, time });
  }
  return refs;
}

/**
 * A page's snapshots, newest first: those under its id, and any taken
 * under its path before it had one.
 */
export async function listSnapshots(
  platform: PlatformAdapter,
  pagePath: string,
  pageId: string | null,
): Promise<SnapshotRef[]> {
  const folders = new Set([snapshotFolder(pagePath, pageId), snapshotFolder(pagePath, null)]);
  const all = (await Promise.all([...folders].map((f) => listFolder(platform, f)))).flat();
  return all.sort((a, b) => b.time.getTime() - a.time.getTime() || (a.path < b.path ? 1 : -1));
}

/** Which snapshots to drop: beyond the newest KEEP_LATEST, or older than KEEP_DAYS, but never the newest ALWAYS_KEEP. */
export function snapshotsToDrop(newestFirst: readonly SnapshotRef[], now: Date): SnapshotRef[] {
  const oldest = now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  return newestFirst.filter(
    (s, i) => i >= ALWAYS_KEEP && (i >= KEEP_LATEST || s.time.getTime() < oldest),
  );
}

/** Drops old snapshots of a page. Failures are ignored: keeping too many is harmless. */
export async function pruneSnapshots(
  platform: PlatformAdapter,
  pagePath: string,
  pageId: string | null,
  now: Date = new Date(),
): Promise<void> {
  const drop = snapshotsToDrop(await listSnapshots(platform, pagePath, pageId), now);
  for (const s of drop) await platform.removeSnapshot(s.path).catch(() => undefined);
}

/** Data files bigger than this get no recovery copy: copying them would take too long. */
export const FILE_SNAPSHOT_LIMIT = 64 * 1024 * 1024;

/**
 * Keeps a copy of any vault file, such as a CSV about to be edited, in
 * `.benchwork/snapshots/<path>/<time><ending>`. Returns its path.
 */
export async function saveFileSnapshot(
  platform: PlatformAdapter,
  path: string,
  now: Date = new Date(),
): Promise<string> {
  const bytes = await platform.readBytes(path, FILE_SNAPSHOT_LIMIT);
  const folder = snapshotFolder(path, null);
  await platform.ensureDir(folder);
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  const ending = dot > 0 ? name.slice(dot) : '';
  const stamp = snapshotStamp(now);
  for (let n = 1; n < 100; n += 1) {
    const candidate = joinVaultPath(
      folder,
      n === 1 ? `${stamp}${ending}` : `${stamp} ${String(n)}${ending}`,
    );
    if (await platform.exists(candidate)) continue;
    await platform.writeBytes(candidate, bytes);
    return candidate;
  }
  throw new Error('Could not find a free name for the snapshot');
}
