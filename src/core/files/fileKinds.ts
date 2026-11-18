import { isCanvas, isPage } from '../notebooks/notebookTree';
import { isImage } from '../pages/attachments';
import { baseName } from '../platform';
import { recordKind } from '../records/records';

/**
 * What a file is, for showing it: the sidebar shows pages and these kinds,
 * and the main area previews them. Everything else is `other`, shown only
 * with "Show all files" on.
 */
export type FileKind =
  | 'page'
  | 'image'
  /** CSV or TSV. */
  | 'table'
  /** Excel or OpenDocument spreadsheets. */
  | 'spreadsheet'
  | 'pdf'
  /** A Word document, `.docx`. */
  | 'word'
  /** `<name>.canvas.json`, drawn by the Mind maps and canvas module. */
  | 'canvas'
  /** A linked file's record, `<name>.link.yaml`: path, size and checksum. */
  | 'link'
  /** Any other record, such as `<name>.dataset.yaml`. */
  | 'record'
  | 'other';

/** The record kind for linked files. */
export const LINK_RECORD = 'link';

const TABLE = new Set(['csv', 'tsv']);
const SPREADSHEET = new Set(['xlsx', 'xlsm', 'xls', 'ods']);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export function fileKind(path: string): FileKind {
  const name = baseName(path);
  if (isPage(name)) return 'page';
  if (isCanvas(name)) return 'canvas';
  const kind = recordKind(name);
  if (kind !== null) return kind === LINK_RECORD ? 'link' : 'record';
  if (isImage(name)) return 'image';
  const ext = extensionOf(name);
  if (TABLE.has(ext)) return 'table';
  if (SPREADSHEET.has(ext)) return 'spreadsheet';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'word';
  return 'other';
}

/** What a file with no ending holds, read from its first bytes. */
export interface Sniffed {
  kind: 'image' | 'pdf';
  /** The ending it should have, such as `.jpg`. */
  ending: string;
  /** Its media type, for showing it. */
  type: string;
}

const starts = (b: Uint8Array, sig: readonly number[], at = 0) =>
  sig.every((v, i) => b[at + i] === v);

/** Looks at a file's first bytes for an image or PDF. */
export function sniff(bytes: Uint8Array): Sniffed | null {
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47])) {
    return { kind: 'image', ending: '.png', type: 'image/png' };
  }
  if (starts(bytes, [0xff, 0xd8, 0xff])) {
    return { kind: 'image', ending: '.jpg', type: 'image/jpeg' };
  }
  if (starts(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return { kind: 'image', ending: '.gif', type: 'image/gif' };
  }
  if (starts(bytes, [0x52, 0x49, 0x46, 0x46]) && starts(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { kind: 'image', ending: '.webp', type: 'image/webp' };
  }
  // `BM`, then a header size only bitmaps use, so text starting "BM" is not taken.
  if (starts(bytes, [0x42, 0x4d]) && [12, 40, 108, 124].includes(bytes[14] ?? 0)) {
    return { kind: 'image', ending: '.bmp', type: 'image/bmp' };
  }
  // `%PDF`, which may come after a little junk at the start.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  if (head.includes('%PDF-')) return { kind: 'pdf', ending: '.pdf', type: 'application/pdf' };
  return null;
}

/** Short words for a kind, for labels such as "CSV table". */
export function kindLabel(path: string): string {
  const kind = fileKind(path);
  switch (kind) {
    case 'table':
      return `${extensionOf(baseName(path)).toUpperCase()} table`;
    case 'spreadsheet':
      return 'Spreadsheet';
    case 'pdf':
      return 'PDF';
    case 'word':
      return 'Word document';
    case 'image':
      return 'Image';
    case 'canvas':
      return 'Canvas';
    case 'link':
      return 'Linked file';
    case 'record': {
      const name = recordKind(path) ?? 'record';
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
    default:
      return 'File';
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
