import { isInk, parseInk } from '../ink/inkFile';
import { suffixKeys } from '../links/resolve';
import { isPage } from '../notebooks/notebookTree';
import { embedPath } from '../pages/attachments';
import {
  baseName,
  normaliseVaultPath,
  parentVaultPath,
  PlatformError,
  type DirEntry,
  type IndexedPage,
  type PlatformAdapter,
  type SearchHit,
} from '../platform';
import { isRecord } from '../records/records';
import { extractFile } from './extract';

/**
 * Keeps the search index in step with the vault. On opening it reads only
 * pages that are new or changed since last time; after that it follows the
 * file watcher. Work runs one task at a time, in batches, in the background.
 */

/** Pages read and sent to the index at a time. */
export const BATCH_SIZE = 25;
/** How long to collect watcher changes before indexing them. */
export const CHANGE_DELAY_MS = 150;

/** Top-level folders whose pages are not searched. */
const SKIPPED_FOLDERS = ['templates'];

export interface IndexProgress {
  state: 'off' | 'indexing' | 'ready' | 'error';
  /** While indexing: pages read so far, and how many there are to read. */
  done: number;
  total: number;
  error: string | null;
}

export const INDEX_OFF: IndexProgress = { state: 'off', done: 0, total: 0, error: null };

/** Whether a folder's pages are searched. Hidden folders and BenchWork's own are not. */
function searchedFolder(path: string): boolean {
  if (path === '') return true;
  const parts = path.split('/');
  if (parts.some((p) => p.startsWith('.'))) return false;
  return !SKIPPED_FOLDERS.includes((parts[0] ?? '').toLowerCase());
}

/** Whether a file is a page or record that should be searched. */
export function searchedPage(path: string): boolean {
  const name = baseName(path);
  return (
    (isPage(name) || isRecord(name)) &&
    !name.startsWith('.') &&
    searchedFolder(parentVaultPath(path) ?? '')
  );
}

export interface IndexServiceEvents {
  progress(progress: IndexProgress): void;
  /** Called after the index changed, so open searches can refresh. */
  updated(): void;
}

export class IndexService {
  private queue: Promise<void> = Promise.resolve();
  private stopped = false;
  private opened = false;
  private pending = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private progress: IndexProgress = INDEX_OFF;

  constructor(
    private readonly platform: PlatformAdapter,
    private readonly events: IndexServiceEvents,
  ) {}

  /** Opens the index and brings it up to date. Resolves when that is done. */
  start(): Promise<void> {
    return this.enqueue(async () => {
      await this.platform.index.open();
      this.opened = true;
      await this.sync();
    });
  }

  /** Empties the index and reads every page again. */
  rebuild(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.opened) return;
      await this.platform.index.clear();
      this.events.updated();
      await this.sync();
    });
  }

  /** Paths the watcher reported. They are indexed shortly, together. */
  changed(paths: readonly string[]): void {
    if (this.stopped) return;
    for (const path of paths) this.pending.add(path);
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.flush();
    }, CHANGE_DELAY_MS);
  }

  /** Resolves once everything reported so far has been indexed, without waiting out the delay. */
  async idle(): Promise<void> {
    this.flush();
    await this.queue;
  }

  /** Queues the collected changes for indexing now. */
  private flush(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.pending.size === 0) return;
    const batch = [...this.pending];
    this.pending.clear();
    void this.enqueue(() => this.update(batch));
  }

  /** Stops indexing, waits for the current batch, and closes the index. */
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
    await this.queue;
    if (this.opened) {
      this.opened = false;
      await this.platform.index.close().catch(() => undefined);
    }
  }

  search(query: string, limit: number): Promise<SearchHit[]> {
    if (!this.opened) return Promise.resolve([]);
    return this.platform.index.search(query, limit);
  }

  /** Pages with a tag, or a tag nested under it. */
  tagged(tag: string, limit: number): Promise<SearchHit[]> {
    if (!this.opened) return Promise.resolve([]);
    return this.platform.index.tagged(tag, limit);
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.queue.then(async () => {
      if (this.stopped) return;
      try {
        await task();
      } catch (err) {
        this.report({
          ...this.progress,
          state: 'error',
          error: PlatformError.from(err).message,
        });
      }
    });
    this.queue = run;
    return run;
  }

  /** Read through a method: it changes while awaiting, which TypeScript cannot see. */
  private isStopped(): boolean {
    return this.stopped;
  }

  private report(progress: IndexProgress): void {
    this.progress = progress;
    this.events.progress(progress);
  }

  /** Every searched page in `folder` and below; drawings found on the way go in `drawings`. */
  private async walk(folder: string, drawings: DirEntry[] = []): Promise<DirEntry[]> {
    if (!searchedFolder(folder)) return [];
    const found: DirEntry[] = [];
    const visit = async (dir: string) => {
      for (const entry of await this.platform.listDir(dir)) {
        if (this.stopped) return;
        if (entry.isDir) {
          if (searchedFolder(entry.path)) await visit(entry.path);
        } else if (searchedPage(entry.path)) {
          found.push(entry);
        } else if (isInk(entry.path)) {
          drawings.push(entry);
        }
      }
    };
    await visit(folder);
    return found;
  }

  /** The pages that show a drawing. */
  private async pagesShowing(drawing: string): Promise<string[]> {
    try {
      const refs = await this.platform.index.backlinks(suffixKeys(drawing));
      return [...new Set(refs.map((r) => r.source))];
    } catch {
      return [];
    }
  }

  /** The text recognised in the drawings a page shows, to search with the page. */
  private async drawingText(page: IndexedPage): Promise<string> {
    const texts: string[] = [];
    for (const link of page.links) {
      if (!link.embed || !isInk(link.target)) continue;
      const path = embedPath(link.target);
      if (path === null) continue;
      try {
        const text = parseInk(await this.platform.readText(path)).ink.recognisedText;
        if (text) texts.push(text);
      } catch {
        // A drawing not there yet adds nothing.
      }
    }
    return texts.join('\n');
  }

  /** Reads pages and sends them to the index in batches. */
  private async index(files: readonly DirEntry[], removes: readonly string[]): Promise<void> {
    let first = true;
    for (let i = 0; i < files.length || first; i += BATCH_SIZE) {
      if (this.stopped) return;
      const pages: IndexedPage[] = [];
      for (const file of files.slice(i, i + BATCH_SIZE)) {
        try {
          const text = await this.platform.readText(file.path);
          const page = extractFile(file.path, text, { mtime: file.modified, size: file.size });
          const drawn = await this.drawingText(page);
          pages.push(drawn === '' ? page : { ...page, body: `${page.body}\n${drawn}` });
        } catch (err) {
          // A page that vanished or cannot be read is left out; the
          // watcher will report it again if it comes back.
          if (PlatformError.from(err).kind !== 'NotFound') {
            console.warn(`Not indexed: ${file.path}`, err);
          }
        }
      }
      // stop() may have been called while the pages were read.
      if (this.isStopped()) return;
      await this.platform.index.apply(pages, first ? removes : []);
      first = false;
      if (this.progress.state === 'indexing') {
        this.report({ ...this.progress, done: Math.min(this.progress.total, i + BATCH_SIZE) });
      }
      this.events.updated();
    }
  }

  /** Brings the whole index up to date by comparing it with the vault. */
  private async sync(): Promise<void> {
    const drawings: DirEntry[] = [];
    const files = await this.walk('', drawings);
    const known = new Map((await this.platform.index.entries()).map((e) => [e.path, e]));
    const changed = files.filter((f) => {
      const entry = known.get(f.path);
      return !entry || entry.mtime !== f.modified || entry.size !== f.size;
    });
    // Pages whose drawings changed since, such as text recognised on another device.
    const byPath = new Map(files.map((f) => [f.path, f]));
    for (const drawing of drawings) {
      for (const source of await this.pagesShowing(drawing.path)) {
        const entry = known.get(source);
        const file = byPath.get(source);
        if (
          file &&
          !changed.includes(file) &&
          entry?.mtime != null &&
          drawing.modified != null &&
          drawing.modified > entry.mtime
        ) {
          changed.push(file);
        }
      }
    }
    const present = new Set(files.map((f) => f.path));
    const removes = [...known.keys()].filter((p) => !present.has(p));
    this.report({ state: 'indexing', done: 0, total: changed.length, error: null });
    await this.index(changed, removes);
    if (!this.stopped) this.report({ state: 'ready', done: 0, total: 0, error: null });
  }

  /** Indexes what the watcher reported: changed pages, removed or new files and folders. */
  private async update(paths: readonly string[]): Promise<void> {
    if (!this.opened) return;
    const files: DirEntry[] = [];
    const removes: string[] = [];
    const listings = new Map<string, Promise<DirEntry[] | null>>();
    const list = (dir: string) => {
      let listing = listings.get(dir);
      if (!listing) {
        listing = this.platform.listDir(dir).catch(() => null);
        listings.set(dir, listing);
      }
      return listing;
    };
    for (const raw of paths) {
      let path: string;
      try {
        path = normaliseVaultPath(raw);
      } catch {
        continue;
      }
      const parent = parentVaultPath(path);
      if (path === '' || parent === null || !searchedFolder(parent)) continue;
      const entry = (await list(parent))?.find((e) => e.path === path);
      if (!entry) {
        removes.push(path);
      } else if (entry.isDir) {
        files.push(...(await this.walk(path)));
      } else if (searchedPage(path)) {
        files.push(entry);
      } else if (isInk(path)) {
        // A drawing changed: its pages are searched with its text.
        for (const source of await this.pagesShowing(path)) {
          const sourceEntry = (await list(parentVaultPath(source) ?? ''))?.find(
            (e) => e.path === source,
          );
          if (sourceEntry && !files.some((f) => f.path === source)) files.push(sourceEntry);
        }
      }
    }
    if (files.length > 0 || removes.length > 0) await this.index(files, removes);
  }
}
