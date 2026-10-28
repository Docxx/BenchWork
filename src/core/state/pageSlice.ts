import type { Editor } from '@tiptap/core';
import type * as Y from 'yjs';
import { loadPage, savePage } from '../editor/markdown/markdown';
import type { BodySource } from '../editor/markdown/model';
import { createPageYDoc, yDocToPage } from '../editor/yjsDoc';
import { pageTitle } from '../notebooks/notebookTree';
import { embedPath, imagePath } from '../pages/attachments';
import {
  ensureId,
  localTimestamp,
  pageProperties,
  updateMeta,
  updateProperties,
  type ParsedPage,
} from '../pages/frontmatter';
import {
  listSnapshots,
  pruneSnapshots,
  saveSnapshot,
  snapshotFolder,
  SNAPSHOT_INTERVAL_MS,
  type SnapshotRef,
} from '../pages/snapshots';
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

/**
 * The open page's editor, with what the toolbar needs that only the
 * editor's own component can do. Set while a page is open in the editor.
 */
export interface PageEditorHandle {
  editor: Editor;
  /** Asks which template to put in at `pos`. */
  chooseTemplate: (pos: number) => void;
  /** Asks for files, adds them to the vault, and puts them in at `pos`. */
  addFilesAt: (pos: number) => void;
}

export interface PageSlice {
  page: OpenPage | null;
  /** The open page's editor, for the toolbar; null while none is showing. */
  pageEditor: PageEditorHandle | null;
  setPageEditor: (handle: PageEditorHandle | null) => void;
  /**
   * The open page's frontmatter as data, every key. Null when the page has
   * none, or when it cannot be read (then it is never changed).
   */
  pageProperties: Record<string, unknown> | null;
  /** Whether the open page's frontmatter could not be read. */
  propertiesBroken: boolean;
  /** Sets or (with null) removes frontmatter keys; saved with the next autosave. */
  setPageProperties: (changes: Record<string, unknown>) => void;
  /** Whether the Properties panel is asking for a new property's name. */
  addingProperty: boolean;
  setAddingProperty: (adding: boolean) => void;
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
  /** Earlier versions of the open page, newest first. */
  pageHistory: () => Promise<SnapshotRef[]>;
  /** A snapshot's text, for previewing it. */
  readSnapshot: (path: string) => Promise<string>;
  /** Puts a snapshot back as the open page; the current version becomes a snapshot. */
  restoreSnapshot: (path: string) => Promise<void>;
  /** In a conflict: load the disk version; the editor's version becomes a snapshot. */
  loadDiskVersion: () => Promise<void>;
  /** After a rename or move in the sidebar, keeps the open page pointing at its file. */
  pageMoved: (from: string, to: string) => void;
  dismissPageNotice: () => void;
  /**
   * A URL to load an image in the open page from: `src` is an embed target
   * when `embed` is true, otherwise a Markdown image source. Null if none.
   */
  assetUrl: (src: string, embed: boolean) => string | null;
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
  /** When each page (by snapshot folder) last had an automatic snapshot, this session. */
  const lastSnapshot = new Map<string, number>();

  /**
   * Keeps `previous`, the version about to be replaced, as a snapshot: the
   * first time a page changes in a session, then at most every
   * SNAPSHOT_INTERVAL_MS. A snapshot that fails never stops a save.
   */
  async function autoSnapshot(path: string, id: string | null, previous: string): Promise<void> {
    if (previous === '') return;
    const key = snapshotFolder(path, id);
    const last = lastSnapshot.get(key);
    if (last !== undefined && Date.now() - last < SNAPSHOT_INTERVAL_MS) return;
    try {
      await keepSnapshot(path, id, previous);
      await pruneSnapshots(platform, path, id);
    } catch (err) {
      console.warn('Could not keep a snapshot', err);
    }
  }

  /** Saves a snapshot now; it counts as the page's latest for automatic ones. */
  async function keepSnapshot(path: string, id: string | null, text: string): Promise<void> {
    lastSnapshot.set(snapshotFolder(path, id), Date.now());
    await saveSnapshot(platform, path, id, text);
  }

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
      if (session === s) markEdited(s);
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
      addingProperty: false,
      ...propertiesState(s.page),
    });
    return s;
  }

  function propertiesState(page: ParsedPage): {
    pageProperties: Record<string, unknown> | null;
    propertiesBroken: boolean;
  } {
    if (page.error !== null) return { pageProperties: null, propertiesBroken: true };
    return {
      pageProperties: page.yaml === null ? null : pageProperties(page),
      propertiesBroken: false,
    };
  }

  /** Notes an edit and starts the autosave timer again. */
  function markEdited(s: Session): void {
    s.dirty = true;
    set({ saveState: 'unsaved' });
    if (s.timer !== null) clearTimeout(s.timer);
    s.timer = setTimeout(() => {
      s.timer = null;
      void get().savePageNow();
    }, AUTOSAVE_MS);
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
    await autoSnapshot(s.path, page.meta.id, previous);
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
      await keepSnapshot(s.path, s.page.meta.id, render(s).text).catch(() => undefined);
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
      // Changed elsewhere, such as by sync: keep what was here first.
      await autoSnapshot(s.path, s.page.meta.id, s.lastText);
      if (session === s && !editedSince(s)) reload(s, text);
    }
  }

  function closeWithNotice(notice: string): void {
    const s = session;
    if (!s) return;
    s.stopObserving();
    s.ydoc.destroy();
    session = null;
    set({
      page: null,
      saveState: 'saved',
      pageConflict: null,
      pageNotice: notice,
      pageProperties: null,
      propertiesBroken: false,
    });
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
      set({
        page: null,
        saveState: 'saved',
        pageNotice: null,
        pageConflict: null,
        pageProperties: null,
        propertiesBroken: false,
      });
    },
  });

  return {
    page: null,
    pageEditor: null,
    setPageEditor: (handle) => {
      set({ pageEditor: handle });
    },
    pageProperties: null,
    propertiesBroken: false,
    addingProperty: false,
    setAddingProperty: (addingProperty) => {
      set({ addingProperty });
    },

    setPageProperties: (changes) => {
      const s = session;
      if (!s || s.page.error !== null || get().pageConflict !== null) return;
      try {
        s.page = updateProperties(s.page, changes);
      } catch (err) {
        set({ pageNotice: err instanceof Error ? err.message : String(err) });
        return;
      }
      set(propertiesState(s.page));
      markEdited(s);
    },

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
      // The last page's backlinks go straight away; this page's follow.
      set({ pageNotice: null, backlinks: [], openFile: null, moduleView: null });
      startSession(path, text, 0);
      void get().loadBacklinks(path);
      void get().loadDayNeighbours(path);
    },

    closePage: async () => {
      openToken += 1;
      await endSession();
      set({
        page: null,
        saveState: 'saved',
        pageConflict: null,
        pageProperties: null,
        propertiesBroken: false,
      });
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
        await keepSnapshot(s.path, s.page.meta.id, conflict.diskText);
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
      await keepSnapshot(s.path, s.page.meta.id, mine);
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

    pageHistory: async () => {
      const s = session;
      if (!s) return [];
      return listSnapshots(platform, s.path, s.page.meta.id).catch(() => []);
    },

    readSnapshot: (path) => platform.readText(path),

    restoreSnapshot: async (path) => {
      const s = session;
      if (!s || get().pageConflict !== null) return;
      try {
        const text = await platform.readText(path);
        await queueSave(s);
        if (session !== s) return;
        const current = s.lastText;
        if (current === text) return;
        // The version being replaced is kept, so a restore can be undone.
        await keepSnapshot(s.path, s.page.meta.id, current);
        s.lastText = text;
        await platform.writeTextAtomic(s.path, text);
        reload(s, text);
        set({
          pageNotice: 'Restored an earlier version. The version before it is kept in History.',
        });
      } catch (err) {
        set({
          pageNotice: `That version could not be restored. ${PlatformError.from(err).message}`,
        });
      }
    },

    assetUrl: (src, embed) => {
      const s = session;
      if (!s) return null;
      const path = embed ? embedPath(src) : imagePath(s.path, src);
      return path === null ? null : platform.assetUrl(path);
    },
  };
}
