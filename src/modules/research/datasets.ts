import type { ModuleVault } from '@core/api';

/**
 * Dataset records, `<name>.dataset.yaml`: what a dataset is, which
 * experiment it belongs to, and its files with their size and SHA-256.
 * Files inside the vault are written as vault paths; files on lab storage
 * as full paths, so large data stays where it is.
 */

export const DATASET = 'dataset';
export const DATASET_ENDING = '.dataset.yaml';

export interface DatasetFile {
  path: string;
  size: number | null;
  sha256: string | null;
}

/** The files a record lists. Entries without a path are skipped. */
export function datasetFiles(data: Record<string, unknown>): DatasetFile[] {
  const files = data['files'];
  if (!Array.isArray(files)) return [];
  return files.flatMap((f: unknown): DatasetFile[] => {
    if (typeof f === 'string')
      return f.trim() === '' ? [] : [{ path: f, size: null, sha256: null }];
    if (typeof f !== 'object' || f === null) return [];
    const record = f as Record<string, unknown>;
    const path = record['path'];
    if (typeof path !== 'string' || path.trim() === '') return [];
    const size = record['size'];
    const sha = record['sha256'];
    return [
      {
        path: path.trim(),
        size: typeof size === 'number' ? size : null,
        sha256: typeof sha === 'string' ? sha.toLowerCase() : null,
      },
    ];
  });
}

/** Files as written in the record: only the keys that are known. */
export function filesValue(files: readonly DatasetFile[]): Record<string, unknown>[] {
  return files.map((f) => ({
    path: f.path,
    ...(f.size === null ? {} : { size: f.size }),
    ...(f.sha256 === null ? {} : { sha256: f.sha256 }),
  }));
}

/** Whether a path is a full path outside the vault, rather than a vault path. */
export function isFullPath(path: string): boolean {
  return /^[a-z]:[\\/]/i.test(path) || path.startsWith('/') || path.startsWith('\\\\');
}

/** The folder a full path is in, for the record's `external` location. */
export function folderOf(fullPath: string): string {
  const i = Math.max(fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\'));
  return i <= 0 ? fullPath : fullPath.slice(0, i);
}

/** The last part of a vault or full path. */
export function fileName(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1);
}

/** A file the user picked, with its size and checksum. Vault files keep their vault path. */
export async function describeFile(vault: ModuleVault, fullPath: string): Promise<DatasetFile> {
  const inside = vault.vaultPathOf(fullPath);
  const path = inside ?? fullPath;
  const external = inside === null;
  const info = await vault.fileInfo(path, external);
  const sha256 = await vault.hashFile(path, external);
  return { path, size: info.size, sha256 };
}

export type FileState = 'same' | 'changed' | 'missing' | 'unreadable' | 'unchecked';

/** Compares a file with its size and checksum in the record. Reads the whole file. */
export async function checkFile(vault: ModuleVault, file: DatasetFile): Promise<FileState> {
  const external = isFullPath(file.path);
  try {
    const info = await vault.fileInfo(file.path, external);
    if (file.sha256 === null) return 'unchecked';
    if (file.size !== null && file.size !== info.size) return 'changed';
    return (await vault.hashFile(file.path, external)) === file.sha256 ? 'same' : 'changed';
  } catch (err) {
    const kind = (err as { kind?: unknown } | null)?.kind;
    return kind === 'NotFound' ? 'missing' : 'unreadable';
  }
}

/** Sizes as people read them: 512 bytes, 2.4 KB, 1.3 GB. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} ${bytes === 1 ? 'byte' : 'bytes'}`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : String(Math.round(value))} ${units[unit] ?? 'TB'}`;
}
