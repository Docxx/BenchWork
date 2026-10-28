import { baseName, parentVaultPath } from '../platform/vaultPath';

/**
 * The vault syncs between devices with Syncthing. When a file changes on
 * two devices before they sync, Syncthing keeps both: the file, and a
 * conflict copy beside it named like
 * `Notes.sync-conflict-20261028-113945-ABCDEF7.md`. BenchWork keeps these
 * copies out of search and the sidebar, merges drawings by itself, and
 * shows pages side by side so the person can choose.
 */

/** A conflict copy, and the file it is a copy of. */
export interface ConflictCopy {
  /** The copy's vault path. */
  copy: string;
  /** The file's vault path. */
  original: string;
  /** When the copy was made, as Syncthing named it (that device's local time). */
  when: Date;
  /** The start of the other device's Syncthing ID. */
  device: string;
}

const CONFLICT = /^(.+)\.sync-conflict-(\d{8})-(\d{6})-([A-Z0-9]{7})(\.[^.]+)?$/;

/** Whether a file name is a Syncthing conflict copy. */
export function isConflictCopy(name: string): boolean {
  return CONFLICT.test(name);
}

/** What a conflict copy is a copy of, or null if the path is not one. */
export function conflictCopy(path: string): ConflictCopy | null {
  const m = CONFLICT.exec(baseName(path));
  if (!m) return null;
  const [, base = '', date = '', time = '', device = '', ext = ''] = m;
  const folder = parentVaultPath(path) ?? '';
  const name = `${base}${ext}`;
  const when = new Date(
    Number(date.slice(0, 4)),
    Number(date.slice(4, 6)) - 1,
    Number(date.slice(6, 8)),
    Number(time.slice(0, 2)),
    Number(time.slice(2, 4)),
    Number(time.slice(4, 6)),
  );
  return { copy: path, original: folder === '' ? name : `${folder}/${name}`, when, device };
}

/** Files that differ on every device, so are never synced: the search index, recovery copies, the trash. */
export const SYNC_IGNORE_LINES = [
  '.benchwork/index.sqlite*',
  '.benchwork/snapshots',
  '.benchwork/trash',
] as const;

const IGNORE_HEADING = '// BenchWork: rebuilt or kept on each device, never synced';

/**
 * The vault's `.stignore` with BenchWork's lines added, or null if it has
 * them all. Lines already there, the person's own included, are kept.
 */
export function withSyncIgnore(existing: string | null): string | null {
  const text = existing ?? '';
  const have = new Set(text.split(/\r?\n/).map((l) => l.trim()));
  const missing = SYNC_IGNORE_LINES.filter((l) => !have.has(l));
  if (missing.length === 0) return null;
  const block = [...(have.has(IGNORE_HEADING) ? [] : [IGNORE_HEADING]), ...missing].join('\n');
  if (text.trim() === '') return `${block}\n`;
  return `${text.replace(/\s*$/, '')}\n\n${block}\n`;
}

/** One line in a comparison of two texts. */
export interface DiffLine {
  /** `same` in both; `mine` only in this device's copy; `theirs` only in the other's. */
  kind: 'same' | 'mine' | 'theirs';
  text: string;
}

/**
 * Two texts line by line: the longest run of lines they share, and what
 * each has besides. Pages are short enough for the simple method.
 */
export function lineDiff(mine: string, theirs: string): DiffLine[] {
  const a = mine.replace(/\r\n/g, '\n').split('\n');
  const b = theirs.replace(/\r\n/g, '\n').split('\n');
  // Lengths of the longest common runs from each point to the end.
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] =
        a[i] === b[j]
          ? (table[(i + 1) * cols + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * cols + j] ?? 0, table[i * cols + j + 1] ?? 0);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] ?? '' });
      i += 1;
      j += 1;
    } else if (
      j >= b.length ||
      (i < a.length && (table[(i + 1) * cols + j] ?? 0) >= (table[i * cols + j + 1] ?? 0))
    ) {
      out.push({ kind: 'mine', text: a[i] ?? '' });
      i += 1;
    } else {
      out.push({ kind: 'theirs', text: b[j] ?? '' });
      j += 1;
    }
  }
  return out;
}
