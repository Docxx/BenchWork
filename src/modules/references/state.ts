import type { ModuleContext } from '@core/api';
import { parseLibrary, type Collection, type Reference } from './library';
import { ZOTERO_LIBRARY } from './zoteroWeb';

/** Where the library file is looked for until another is chosen. */
export const DEFAULT_LIBRARY = 'references/library.json';
const SETTINGS_FILE = 'settings.json';

interface Settings {
  libraryPath: string;
  /** Read the copy of the Zotero account BenchWork keeps, not libraryPath. */
  zotero?: boolean;
}

export interface LibrarySnapshot {
  path: string;
  /** The Better BibTeX file, used when no Zotero account is connected. */
  filePath: string;
  /** True when the library is BenchWork's copy of a Zotero account. */
  zotero: boolean;
  collections: readonly Collection[];
  /** The references by key; a new map whenever the library is reloaded. */
  refs: ReadonlyMap<string, Reference>;
  /** `missing`: no file there yet; `error`: the file could not be used. */
  status: 'loading' | 'ready' | 'missing' | 'error';
  count: number;
  /** When the file last changed, in ms, if known. */
  modified: number | null;
  error: string | null;
}

/**
 * The loaded library and where it comes from. The settings panel follows it
 * through subscribe; citations read it through refs. Reloads when the file
 * changes, such as when Better BibTeX updates it after a change in Zotero.
 */
export class LibraryState {
  /** The references by key, for citations. */
  get refs(): ReadonlyMap<string, Reference> {
    return this.snapshot.refs;
  }
  private snapshot: LibrarySnapshot = {
    path: DEFAULT_LIBRARY,
    filePath: DEFAULT_LIBRARY,
    zotero: false,
    collections: [],
    refs: new Map(),
    status: 'loading',
    count: 0,
    modified: null,
    error: null,
  };
  private readonly listeners = new Set<() => void>();

  constructor(private readonly ctx: ModuleContext) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly current = (): LibrarySnapshot => this.snapshot;

  private set(next: Partial<LibrarySnapshot>): void {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }

  private loadedOnce: () => void = () => undefined;
  /** Resolves once the library has been read for the first time, whatever was found. */
  readonly ready: Promise<void> = new Promise((resolve) => {
    this.loadedOnce = resolve;
  });

  /** Reads the saved settings, loads the library, and follows changes to it. */
  async start(): Promise<void> {
    const settings = await this.ctx.storage
      .read<Partial<Settings>>(SETTINGS_FILE)
      .catch(() => null);
    const filePath =
      typeof settings?.libraryPath === 'string' ? settings.libraryPath : DEFAULT_LIBRARY;
    const zotero = settings?.zotero === true;
    this.set({ filePath, zotero, path: zotero ? ZOTERO_LIBRARY : filePath });
    this.ctx.vault.watch((change) => {
      if (change.paths.includes(this.snapshot.path)) void this.load();
    });
    try {
      await this.load();
    } finally {
      this.loadedOnce();
    }
  }

  /** Uses another file as the library, and remembers it in this vault. */
  async choose(path: string): Promise<void> {
    await this.save(path, this.snapshot.zotero);
  }

  /** Switches between the Zotero account's copy and the Better BibTeX file. */
  async useZotero(on: boolean): Promise<void> {
    await this.save(this.snapshot.filePath, on);
  }

  private async save(filePath: string, zotero: boolean): Promise<void> {
    await this.ctx.storage.write(SETTINGS_FILE, {
      libraryPath: filePath,
      ...(zotero ? { zotero } : {}),
    } satisfies Settings);
    this.set({ filePath, zotero, path: zotero ? ZOTERO_LIBRARY : filePath });
    await this.load();
  }

  async load(): Promise<void> {
    const { path } = this.snapshot;
    if (!(await this.ctx.vault.exists(path))) {
      this.set({
        refs: new Map(),
        collections: [],
        status: 'missing',
        count: 0,
        modified: null,
        error: null,
      });
      this.ctx.citations.refresh();
      return;
    }
    try {
      const [text, info] = await Promise.all([
        this.ctx.vault.readText(path),
        this.ctx.vault.fileInfo(path).catch(() => null),
      ]);
      const library = parseLibrary(text);
      // A half-written file (mid-save) keeps the last good library.
      if (library.error !== null && this.refs.size > 0) {
        this.set({ error: library.error });
        return;
      }
      this.set({
        refs: library.refs,
        collections: library.collections,
        status: library.error === null ? 'ready' : 'error',
        count: library.refs.size,
        modified: info?.modified ?? null,
        error: library.error,
      });
    } catch (err) {
      this.set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
    this.ctx.citations.refresh();
  }
}
