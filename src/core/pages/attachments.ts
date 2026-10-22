import { freeName, NameError, safeName } from '../notebooks/notebookService';
import { baseName, joinVaultPath, parentVaultPath, type PlatformAdapter } from '../platform';
import { snapshotStamp } from './snapshots';

/**
 * Files pasted or dragged into a page are copied into `attachments/` at the
 * vault root and embedded as `![[attachments/<name>]]`. A vault path, unlike
 * a path relative to the page, keeps working when the page moves.
 */

export const ATTACHMENTS_DIR = 'attachments';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']);

const IMAGE_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/avif': '.avif',
};

/** A file from a paste or drop, independent of the browser's File type. */
export interface IncomingFile {
  name: string;
  /** MIME type; may be empty. */
  type: string;
  size: number;
  bytes(): Promise<Uint8Array>;
}

export type FileSource = 'paste' | 'drop';

/** A file that could not be added, with a message to show. */
export class AttachmentError extends Error {
  override readonly name = 'AttachmentError';
}

/** The extension of a file name, lower case, without the dot. */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function isImage(path: string): boolean {
  return IMAGE_EXTENSIONS.has(extensionOf(baseName(path)));
}

/** Splits `photo.final.png` into `photo.final` and `.png`. Odd endings are not extensions. */
export function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  const ext = dot <= 0 ? '' : name.slice(dot).toLowerCase();
  if (!/^\.[a-z0-9_-]{1,16}$/.test(ext)) return { base: name, ext: '' };
  return { base: name.slice(0, dot), ext };
}

/**
 * The name to save a file under, before clashes are resolved. Pasted
 * images are named by time, since the clipboard gives every one the same
 * name; dropped files keep theirs, made safe for Windows.
 */
export function attachmentName(file: IncomingFile, source: FileSource, now: Date): string {
  const typeExt = IMAGE_TYPES[file.type];
  if (source === 'paste' && typeExt !== undefined) {
    return `Pasted image ${snapshotStamp(now)}${typeExt}`;
  }
  const { base, ext } = splitName(baseName(file.name.replace(/\\/g, '/')));
  let safeBase: string;
  try {
    safeBase = safeName(base);
  } catch (err) {
    if (!(err instanceof NameError)) throw err;
    safeBase = 'File';
  }
  return `${safeBase}${ext === '' ? (typeExt ?? '') : ext}`;
}

/**
 * Copies a file into `attachments/` under a free name and returns its vault
 * path. Never overwrites. Files over `limitBytes` are refused before they
 * are read.
 */
export async function saveAttachment(
  platform: PlatformAdapter,
  file: IncomingFile,
  source: FileSource,
  limitBytes: number,
  now: Date = new Date(),
): Promise<string> {
  if (file.size > limitBytes) {
    const limitMB = Math.round(limitBytes / (1024 * 1024));
    throw new AttachmentError(
      `${file.name} is over ${String(limitMB)} MB, so it was not added. You can change the limit in Settings.`,
    );
  }
  const { base, ext } = splitName(attachmentName(file, source, now));
  await platform.ensureDir(ATTACHMENTS_DIR);
  const name = await freeName(platform, ATTACHMENTS_DIR, base, ext);
  const path = joinVaultPath(ATTACHMENTS_DIR, name);
  await platform.writeBytes(path, await file.bytes());
  return path;
}

/**
 * The vault path an embed points at. `![[attachments/a.png]]` is a vault
 * path; a bare name such as `![[a.png]]` is looked for in `attachments/`.
 * Null for targets that are not files, such as `![[Page#Heading]]`.
 */
export function embedPath(target: string): string | null {
  const clean = target.split('#')[0]?.trim() ?? '';
  if (clean === '') return null;
  const path = clean.includes('/') ? clean : `${ATTACHMENTS_DIR}/${clean}`;
  try {
    return joinVaultPath('', path);
  } catch {
    return null;
  }
}

/**
 * The vault path of a Markdown image, `![](src)`, written in the page at
 * `pagePath`. Relative sources are read from the page's folder. Null for
 * web addresses, data URLs and paths that leave the vault.
 */
export function imagePath(pagePath: string, src: string): string | null {
  if (src === '' || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) return null;
  let decoded: string;
  try {
    decoded = decodeURI(src.split(/[?#]/)[0] ?? '');
  } catch {
    return null;
  }
  const folder = decoded.startsWith('/') ? '' : (parentVaultPath(pagePath) ?? '');
  const parts = folder === '' ? [] : folder.split('/');
  for (const part of decoded.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  try {
    return joinVaultPath('', parts.join('/'));
  } catch {
    return null;
  }
}
