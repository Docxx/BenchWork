import type * as Y from 'yjs';
import { loadPage, savePage } from '../editor/markdown/markdown';
import type { BodySource } from '../editor/markdown/model';
import { createPageYDoc, yDocToPage } from '../editor/yjsDoc';
import { pageTitle } from '../notebooks/notebookTree';
import {
  AttachmentError,
  embedPath,
  imagePath,
  isImage,
  saveAttachment,
  type FileSource,
  type IncomingFile,
} from '../pages/attachments';
import { ensureId, localTimestamp, updateMeta, type ParsedPage } from '../pages/frontmatter';
import { saveSnapshot } from '../pages/snapshots';
import { baseName, PlatformError } from '../platform';
import type { StoreContext } from './context';
import { rebasePath } from './treeSlice';

/** Autosave runs this long after the last change. */
export const AUTOSAVE_MS = 1000;

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';

/** The page open in the editor. */
export interface OpenPage {
  path: string;
  title: string;
  ydoc: Y.Doc;
  /** Changes when the content is replaced from disk, so the editor starts afresh. */
  version: number;
}

/** The page changed on disk while it had unsaved edits. */
export interface PageConflict {
  /** What is on disk now, or null if the file has gone. */
  diskText: string | null;
}

export interface PageSlice {
  page: OpenPage | null;
  saveState: SaveState;
  /** A message about the open page, such as why it could not be saved. */
  pageNotice: string | null;
  pageConflict: PageConflict | null;

  openPage: (path: string) => Promise<void>;
  /** Saves any changes, then closes the page. */
  closePage: () => Promise<void>;
  /** Saves now instead of waiting for autosave. */
  savePageNow: () => Promise<void>;
  /** In a conflict: save the editor's version; the disk version becomes a snapshot. */
  keepMyVersion: () => Promise<void>;
  /** In a conflict: load the disk version; the editor's version becomes a snapshot. */
  loadDiskVersion: () => Promise<void>;
  /** After a rename or move in the sidebar, keeps the open page pointing at its file. */
  pageMoved: (from: string, to: string) => void;
  dismissPageNotice: () => void;
  /**
   * Copies pasted or dropped files into `attachments/` and returns the ones
   * that were added, for the editor to embed. Files that could not be added
   * are listed in the page notice.
   */
  addFiles: (files: readonly IncomingFile[], source: FileSource) => Promise<AddedFile[]>;
  /**
   * A URL to load an image in the open page from: `src` is an embed target
   * when `embed` is true, otherwise a Markdown image source. Null if none.
   */
  assetUrl: (src: string, embed: boolean) => string | null;
}

/** A file copied into the vault for the open page. */
export interface AddedFile {
  /** Vault path, such as `attachments/plot.png`. */
  path: string;
  image: boolean;
}

interface Session {
  path: string;
  page: ParsedPage;
  source: BodySource;
  ydoc: Y.Doc;
  /** The file text as last read or written. A watcher event with this text is our own. */
  lastText: string;
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  stopObserving: () => void;
}

export function createPageSlice(ctx: StoreContext): PageSlice {
  const { platform, set, get } = ctx;
  let session: Session | null = null;
  let saves: Promise<void> = Promise.resolve();
  let openToken = 0;
  let stopWatching: (() => void) | null = null;

  function titleOf(path: string): string {
    return pageTitle(baseName(path));
  }

  function startSession(path: string, text: string, version: number): Session {
    const loaded = loadPage(text);
    const ydoc = createPageYDoc(loaded.doc);
    const s: Session = {
      path,
      page: loaded.page,
      source: loaded.source,
      ydoc,
      lastText: text,
      dirty: false,
      timer: null,
      stopObserving: () => undefined,
    };
    const onUpdate = () => {
      if (session !== s) return;
      s.dirty = true;
      set({ saveState: 'unsaved' });
      if (s.timer !== null) clearTimeout(s.timer);
      s.timer = setTimeout(() => {
        s.timer = null;
        void get().savePageNow();
      }, AUTOSAVE_MS);
    };
    ydoc.on('update', onUpdate);
    s.stopObserving = () => {
      ydoc.off('update', onUpdate);
      if (s.timer !== null) clearTimeout(s.timer);
      s.timer = null;
    };
    session = s;
    set({
      page: { path, title: titleOf(path), ydoc, version },
      saveState: 'saved',
      pageConflict: null,
    });
    return s;
  }

  /** The file text for the session's current content, and the page settings it needs. */
  function render(s: Session): { text: string; page: ParsedPage } {
    const doc = yDocToPage(s.ydoc);
    const plain = savePage(s.page, doc, s.source);
    if (plain === s.lastText || s.page.error !== null) return { text: plain, page: s.page };
    // A real change: give the page an id on its first BenchWork save, and note the time.
    const now = localTimestamp();
    const page = updateMeta(
      ensureId(
        s.page,
        () => crypto.randomUUID(),
        () => now,
      ),
      { modified: now },
    );
    return { text: savePage(page, doc, s.source), page };
  }

  async function writeSession(s: Session): Promise<void> {
    if (!s.dirty) return;
    s.dirty = false;
    if (s.timer !== null) clearTimeout(s.timer);
    s.timer = null;
    const { text, page } = render(s);
    if (text === s.lastText) {
      if (session === s) set({ saveState: 'saved' });
      return;
    }
    if (session === s) set({ saveState: 'saving' });
    const previous = s.lastText;
    s.lastText = text;
    try {
      await platform.writeTextAtomic(s.path, text);
      s.page = page;
      // Edits made while the write was in flight leave the page unsaved.
      if (session === s && !editedSince(s)) set({ saveState: 'saved', pageNotice: null });
    } catch (err) {
      s.lastText = previous;
      s.dirty = true;
      if (session === s) {
        set({
          saveState: 'error',
          pageNotice: `This page could not be saved. ${PlatformError.from(err).message}`,
        });
      }
    }
  }

  /** Whether the page has new edits; read through a function because it changes while saving. */
  function editedSince(s: Session): boolean {
    return s.dirty;
  }

  /** Saves one at a time, so two saves never race. */
  function queueSave(s: Session): Promise<void> {
    const next = saves.then(() => writeSession(s));
    saves = next.catch(() => undefined);
    return next;
  }

  async function endSession(): Promise<void> {
    const s = session;
    if (!s) return;
    if (get().pageConflict === null) {
      await queueSave(s);
    } else if (s.dirty) {
      // Closing with a conflict unresolved: keep the edits as a snapshot, never lose them.
      await saveSnapshot(platform, s.path, s.page.meta.id, render(s).text).catch(() => undefined);
    }
    s.stopObserving();
    s.ydoc.destroy();
    if (session === s) session = null;
  }

  /** Reloads the open page from text on disk, starting a fresh document. */
  function reload(s: Session, text: string): void {
    s.stopObserving();
    s.ydoc.destroy();
    const version = (get().page?.version ?? 0) + 1;
    startSession(s.path, text, version);
  }

  /** Called when the watcher says the open page's file changed. */
  async function checkDisk(): Promise<void> {
    const s = session;
    if (!s) return;
    const path = s.path;
    let text: string | null;
    try {
      text = await platform.readText(path);
    } catch (err) {
      if (PlatformError.from(err).kind !== 'NotFound') return;
      text = null;
    }
    if (session !== s || s.path !== path) return; // moved or closed meanwhile
    if (text === s.lastText) return; // our own save, or no real change

    if (text === null) {
      // Gone. A rename in the sidebar updates the path straight after, so wait a moment.
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (session !== s || s.path !== path || (await platform.exists(path))) return;
      if (s.dirty) {
        set({ pageConflict: { diskText: null } });
      } else {
        closeWithNotice('This page was moved or deleted outside BenchWork.');
      }
      return;
    }
    if (s.dirty || s.timer !== null) {
      set({ pageConflict: { diskText: text } });
    } else {
      reload(s, text);
    }
  }

  function closeWithNotice(notice: string): void {
    const s = session;
    if (!s) return;
    s.stopObserving();
    s.ydoc.destroy();
    session = null;
    set({ page: null, saveState: 'saved', pageConflict: null, pageNotice: notice });
  }

  ctx.onVault({
    opened: () => {
      stopWatching = platform.watch((change) => {
        if (session && change.paths.includes(session.path)) void checkDisk();
      });
    },
    // Save the open page before anything else lets go of the vault.
    closing: async () => {
      stopWatching?.();
      stopWatching = null;
      await get().closePage();
    },
    closed: () => {
      set({ page: null, saveState: 'saved', pageNotice: null, pageConflict: null });
    },
  });

  return {
    page: null,
    saveState: 'saved',
    pageNotice: null,
    pageConflict: null,

    openPage: async (path) => {
      if (get().status.kind !== 'open' || session?.path === path) return;
      const token = (openToken += 1);
      await endSession();
      let text: string;
      try {
        text = await platform.readText(path);
      } catch (err) {
        if (token === openToken) {
          set({
            page: null,
            pageNotice: `This page could not be opened. ${PlatformError.from(err).message}`,
          });
        }
        return;
      }
      if (token !== openToken || get().status.kind !== 'open') return;
      set({ pageNotice: null });
      startSession(path, text, 0);
    },

    closePage: async () => {
      openToken += 1;
      await endSession();
      set({ page: null, saveState: 'saved', pageConflict: null });
    },

    savePageNow: async () => {
      const s = session;
      if (s && get().pageConflict === null) await queueSave(s);
    },

    keepMyVersion: async () => {
      const s = session;
      const conflict = get().pageConflict;
      if (!s || !conflict) return;
      if (conflict.diskText !== null) {
        await saveSnapshot(platform, s.path, s.page.meta.id, conflict.diskText);
      }
      // Whatever is on disk now is what our save replaces.
      s.lastText = conflict.diskText ?? '';
      s.dirty = true;
      set({ pageConflict: null });
      await queueSave(s);
    },

    loadDiskVersion: async () => {
      const s = session;
      const conflict = get().pageConflict;
      if (!s || !conflict) return;
      const mine = render(s).text;
      await saveSnapshot(platform, s.path, s.page.meta.id, mine);
      set({ pageConflict: null });
      if (conflict.diskText === null) {
        closeWithNotice(
          'This page was deleted outside BenchWork. Your version was kept as a snapshot.',
        );
      } else {
        reload(s, conflict.diskText);
      }
    },

    pageMoved: (from, to) => {
      const s = session;
      if (!s) return;
      const moved = rebasePath(s.path, from, to);
      if (moved === s.path) return;
      s.path = moved;
      const page = get().page;
      if (page) set({ page: { ...page, path: moved, title: titleOf(moved) } });
    },

    dismissPageNotice: () => {
      set({ pageNotice: null });
    },

    addFiles: async (files, source) => {
      const status = get().status;
      if (status.kind !== 'open' || session === null) return [];
      const token = ctx.session();
      const limit = status.vault.config.attachments.linkThresholdMB * 1024 * 1024;
      const added: AddedFile[] = [];
      const problems: string[] = [];
      for (const file of files) {
        if (ctx.session() !== token) return [];
        try {
          const path = await saveAttachment(platform, file, source, limit);
          added.push({ path, image: isImage(path) });
        } catch (err) {
          problems.push(
            err instanceof AttachmentError
              ? err.message
              : `${file.name} could not be added. ${PlatformError.from(err).message}`,
          );
        }
      }
      if (ctx.session() !== token) return [];
      set({ pageNotice: problems.length > 0 ? problems.join(' ') : null });
      return added;
    },

    assetUrl: (src, embed) => {
      const s = session;
      if (!s) return null;
      const path = embed ? embedPath(src) : imagePath(s.path, src);
      return path === null ? null : platform.assetUrl(path);
    },
  };
}
