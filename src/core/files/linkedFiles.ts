import { freeName } from '../notebooks/notebookService';
import { ATTACHMENTS_DIR } from '../pages/attachments';
import { localTimestamp } from '../pages/frontmatter';
import { fullBaseName, joinVaultPath, PlatformError, type PlatformAdapter } from '../platform';
import { parseRecord } from '../records/records';
import { stringify } from 'yaml';
import { LINK_RECORD } from './fileKinds';

/**
 * Large files are linked, not copied: the vault keeps a small record,
 * `attachments/<name>.link.yaml`, with where the file is, its size and its
 * SHA-256, so notes can point at data on lab storage without syncing it,
 * and anyone can check later that the file is still the same.
 */

export interface LinkRecord {
  /** Full path of the file, outside the vault. */
  path: string;
  size: number | null;
  sha256: string | null;
  /** When the file was last changed, when it was linked. */
  modified: string | null;
  /** When it was linked. */
  added: string | null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Reads a link record; null if it has no path or cannot be read. */
export function readLinkRecord(source: string): LinkRecord | null {
  const { data, error } = parseRecord(source);
  const path = text(data['path']);
  if (error !== null || path === null) return null;
  const size = data['size'];
  return {
    path,
    size: typeof size === 'number' && Number.isFinite(size) ? size : null,
    sha256: text(data['sha256']),
    modified: text(data['modified']),
    added: text(data['added']),
  };
}

export function linkRecordText(record: LinkRecord, id: string): string {
  const data: Record<string, unknown> = { id, path: record.path };
  if (record.size !== null) data['size'] = record.size;
  if (record.sha256 !== null) data['sha256'] = record.sha256;
  if (record.modified !== null) data['modified'] = record.modified;
  if (record.added !== null) data['added'] = record.added;
  return stringify(data, { lineWidth: 0 });
}

/**
 * Links a file outside the vault: reads its size and checksum, then writes
 * its record under a free name. Returns the record's vault path.
 */
export async function linkFile(
  platform: PlatformAdapter,
  fullPath: string,
  now: Date = new Date(),
  newId: () => string = () => crypto.randomUUID(),
): Promise<string> {
  const info = await platform.fileInfo(fullPath, true);
  const sha256 = await platform.hashFile(fullPath, true);
  const record: LinkRecord = {
    path: fullPath,
    size: info.size,
    sha256,
    modified: info.modified === null ? null : localTimestamp(new Date(info.modified)),
    added: localTimestamp(now),
  };
  await platform.ensureDir(ATTACHMENTS_DIR);
  const ending = `.${LINK_RECORD}.yaml`;
  const name = await freeName(platform, ATTACHMENTS_DIR, fullBaseName(fullPath), ending);
  const path = joinVaultPath(ATTACHMENTS_DIR, name);
  await platform.createNew(path, linkRecordText(record, newId()));
  return path;
}

export type LinkCheck =
  /** Same size and checksum as when it was linked. */
  | { state: 'same' }
  | { state: 'changed'; size: number }
  | { state: 'missing' }
  /** It could not be read, such as when the drive is not connected. */
  | { state: 'unreadable'; message: string }
  /** The record has no checksum to compare with. */
  | { state: 'unchecked'; sha256: string; size: number };

/** Checks a linked file against its record. Reads the whole file. */
export async function checkLinkedFile(
  platform: PlatformAdapter,
  record: LinkRecord,
): Promise<LinkCheck> {
  try {
    const info = await platform.fileInfo(record.path, true);
    const sha256 = await platform.hashFile(record.path, true);
    if (record.sha256 === null) return { state: 'unchecked', sha256, size: info.size };
    if (sha256 === record.sha256.toLowerCase() && (record.size ?? info.size) === info.size) {
      return { state: 'same' };
    }
    return { state: 'changed', size: info.size };
  } catch (err) {
    const e = PlatformError.from(err);
    if (e.kind === 'NotFound') return { state: 'missing' };
    return { state: 'unreadable', message: e.message };
  }
}
