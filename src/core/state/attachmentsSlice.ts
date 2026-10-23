import { isFileEmbed } from '../editor/fileEmbed';
import { linkFile } from '../files/linkedFiles';
import {
  AttachmentError,
  copyInAttachment,
  isImage,
  saveAttachment,
  type FileSource,
  type IncomingFile,
} from '../pages/attachments';
import { fullBaseName, PlatformError, vaultPathOf } from '../platform';
import type { StoreContext } from './context';

/**
 * Adding files to a page. Files up to the size limit in Settings are
 * copied into `attachments/`. Bigger ones are the user's choice, asked each
 * time: link to the file where it is (a small record with its path, size
 * and checksum), or copy it in anyway.
 */

/** A file added for the open page, for the editor to insert. */
export interface AddedFile {
  /** Vault path, such as `attachments/plot.png`. */
  path: string;
  /** Embedded as `![[...]]` (images, tables, PDFs, linked files) rather than linked. */
  embed: boolean;
}

/** A file over the size limit, waiting for the user to choose. */
export interface AttachQuestion {
  name: string;
  size: number;
  limitMB: number;
  /**
   * Whether BenchWork knows where the file is. Pasted and dropped files
   * do not say, so linking one asks the user to find it.
   */
  located: boolean;
}

export type AttachChoice = 'link' | 'copy' | null;

export interface AttachmentsSlice {
  attachQuestion: AttachQuestion | null;
  /** Answers attachQuestion: link, copy, or null to skip the file. */
  answerAttach: (choice: AttachChoice) => void;
  /**
   * Adds pasted or dropped files and returns the ones added. Problems are
   * listed in the page notice.
   */
  addFiles: (files: readonly IncomingFile[], source: FileSource) => Promise<AddedFile[]>;
  /** Asks for files with a file picker, then adds them as addFiles does. */
  pickAndAddFiles: () => Promise<AddedFile[]>;
}

/** Copying in anyway, once the user chose to: no limit. */
const NO_LIMIT = Number.MAX_SAFE_INTEGER;

function added(path: string): AddedFile {
  return { path, embed: isImage(path) || isFileEmbed(path) };
}

export function createAttachmentsSlice(ctx: StoreContext): AttachmentsSlice {
  const { platform, set, get } = ctx;
  let answer: ((choice: AttachChoice) => void) | null = null;

  function ask(question: AttachQuestion): Promise<AttachChoice> {
    answer?.(null);
    set({ attachQuestion: question });
    return new Promise((resolve) => {
      answer = resolve;
    });
  }

  function limitBytes(): number | null {
    const status = get().status;
    if (status.kind !== 'open' || get().page === null) return null;
    return status.vault.config.attachments.linkThresholdMB * 1024 * 1024;
  }

  function problem(name: string, err: unknown): string {
    return err instanceof AttachmentError
      ? err.message
      : `${name} could not be added. ${PlatformError.from(err).message}`;
  }

  /** Runs `work` for each item, collecting files added and problems, for this vault only. */
  async function each<T>(
    items: readonly T[],
    nameOf: (item: T) => string,
    work: (item: T, limit: number) => Promise<string | null>,
  ): Promise<AddedFile[]> {
    const limit = limitBytes();
    if (limit === null) return [];
    const token = ctx.session();
    const done: AddedFile[] = [];
    const problems: string[] = [];
    for (const item of items) {
      if (ctx.session() !== token) return [];
      try {
        const path = await work(item, limit);
        if (path !== null) done.push(added(path));
      } catch (err) {
        problems.push(problem(nameOf(item), err));
      }
    }
    if (ctx.session() !== token) return [];
    set({ pageNotice: problems.length > 0 ? problems.join(' ') : null });
    return done;
  }

  function question(name: string, size: number, limit: number, located: boolean): AttachQuestion {
    return { name, size, limitMB: Math.round(limit / (1024 * 1024)), located };
  }

  ctx.onVault({
    closed: () => {
      answer?.(null);
      answer = null;
      set({ attachQuestion: null });
    },
  });

  return {
    attachQuestion: null,

    answerAttach: (choice) => {
      const resolve = answer;
      answer = null;
      set({ attachQuestion: null });
      resolve?.(choice);
    },

    addFiles: (files, source) =>
      each(
        files,
        (f) => f.name,
        async (file, limit) => {
          if (file.size <= limit) return saveAttachment(platform, file, source, limit);
          const choice = await ask(question(file.name, file.size, limit, false));
          if (choice === 'copy') return saveAttachment(platform, file, source, NO_LIMIT);
          if (choice !== 'link') return null;
          // The browser does not say where a dropped file is, so the user finds it.
          const [found] = await platform.pickFiles({ title: `Find ${file.name}`, multiple: false });
          return found === undefined ? null : linkFile(platform, found);
        },
      ),

    pickAndAddFiles: async () => {
      if (limitBytes() === null) return [];
      const picked = await platform.pickFiles({ title: 'Add files', multiple: true });
      const status = get().status;
      const root = status.kind === 'open' ? status.vault.root : null;
      return each(picked, fullBaseName, async (full, limit) => {
        // A file already in the vault is linked to where it is.
        const inside = root === null ? null : vaultPathOf(root, full);
        if (inside !== null) return inside;
        const { size } = await platform.fileInfo(full, true);
        if (size <= limit) return copyInAttachment(platform, full, limit);
        const choice = await ask(question(fullBaseName(full), size, limit, true));
        if (choice === 'copy') return copyInAttachment(platform, full, NO_LIMIT);
        return choice === 'link' ? linkFile(platform, full) : null;
      });
    },
  };
}
