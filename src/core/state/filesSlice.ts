import {
  checkLinkedFile,
  readLinkRecord,
  type LinkCheck,
  type LinkRecord,
} from '../files/linkedFiles';
import { EMBED_ROWS } from '../editor/fileEmbed';
import { parseCsv, type TableData } from '../files/csv';
import { fileKind } from '../files/fileKinds';
import { readSpreadsheet } from '../files/spreadsheet';
import { isPage } from '../notebooks/notebookTree';
import { embedPath } from '../pages/attachments';
import { baseName } from '../platform';
import type { StoreContext } from './context';
import { rebasePath } from './treeSlice';

/** Files bigger than this are not read for a preview. */
export const PREVIEW_LIMIT_BYTES = 64 * 1024 * 1024;

export interface FilesSlice {
  /** A file that is not a page, open in its viewer in the main area. */
  openFile: string | null;
  /** Goes up when the open file changes on disk, so its viewer reads it again. */
  fileVersion: number;
  /** Opens a page in the editor, or any other file in its viewer. */
  openPath: (path: string) => Promise<void>;
  closeFile: () => void;
  /** After a rename or move, keeps the open file pointing at it. */
  fileMoved: (from: string, to: string) => void;
  /** A vault file's bytes for a preview; fails with TooLarge over PREVIEW_LIMIT_BYTES. */
  readFileBytes: (path: string) => Promise<Uint8Array>;
  readFileText: (path: string) => Promise<string>;
  /** A URL an <img> can show a vault file from. */
  fileUrl: (path: string) => string | null;
  /** The first rows of an embedded table, `![[day7.csv]]`; null if it cannot be read. */
  embedTable: (target: string) => Promise<TableData | null>;
  /** A link record's contents; null if it cannot be read. */
  readLinkRecord: (path: string) => Promise<LinkRecord | null>;
  /** Checks the file a link record points at is still the one that was linked. */
  checkLinkedFile: (record: LinkRecord) => Promise<LinkCheck>;
}

export function createFilesSlice(ctx: StoreContext): FilesSlice {
  const { platform, set, get } = ctx;

  let stopWatching: (() => void) | null = null;

  ctx.onVault({
    opened: () => {
      stopWatching = platform.watch((change) => {
        const open = get().openFile;
        if (open !== null && change.paths.includes(open)) {
          set({ fileVersion: get().fileVersion + 1 });
        }
      });
    },
    closing: () => {
      stopWatching?.();
      stopWatching = null;
    },
    closed: () => {
      set({ openFile: null });
    },
  });

  return {
    openFile: null,
    fileVersion: 0,

    openPath: async (path) => {
      if (get().status.kind !== 'open') return;
      get().showView('files');
      if (isPage(baseName(path))) {
        set({ openFile: null });
        await get().openPage(path);
        return;
      }
      await get().closePage();
      set({ openFile: path, pageNotice: null });
      get().selectEntry(path);
    },

    closeFile: () => {
      set({ openFile: null });
    },

    fileMoved: (from, to) => {
      const open = get().openFile;
      if (open !== null) set({ openFile: rebasePath(open, from, to) });
    },

    readFileBytes: (path) => platform.readBytes(path, PREVIEW_LIMIT_BYTES),
    readFileText: (path) => platform.readText(path),
    fileUrl: (path) => platform.assetUrl(path),
    embedTable: async (target) => {
      const path = embedPath(target);
      if (path === null) return null;
      try {
        const bytes = await platform.readBytes(path, PREVIEW_LIMIT_BYTES);
        if (fileKind(path) === 'table') {
          const tsv = path.toLowerCase().endsWith('.tsv') ? '\t' : undefined;
          return parseCsv(new TextDecoder().decode(bytes), EMBED_ROWS, tsv);
        }
        return (await readSpreadsheet(bytes, EMBED_ROWS))[0] ?? null;
      } catch {
        return null;
      }
    },
    readLinkRecord: async (path) => readLinkRecord(await platform.readText(path)),
    checkLinkedFile: (record) => checkLinkedFile(platform, record),
  };
}
