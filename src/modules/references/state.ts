import type { ModuleContext } from '@core/api';
import { parseLibrary, type Reference } from './library';

/** Where the library file is looked for until another is chosen. */
export const DEFAULT_LIBRARY = 'references/library.json';
const SETTINGS_FILE = 'settings.json';

interface Settings {
  libraryPath: string;
}

export interface LibrarySnapshot {
  path: string;
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
  refs = new Map<string, Reference>();
  private snapshot: LibrarySnapshot = {
    path: DEFAULT_LIBRARY,
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

  /** Reads the saved settings, loads the library, and follows changes to it. */
  async start(): Promise<void> {
    const settings = await this.ctx.storage
      .read<Partial<Settings>>(SETTINGS_FILE)
      .catch(() => null);
    const path = typeof settings?.libraryPath === 'string' ? settings.libraryPath : DEFAULT_LIBRARY;
    this.set({ path });
    this.ctx.vault.watch((change) => {
      if (change.paths.includes(this.snapshot.path)) void this.load();
    });
    await this.load();
  }

  /** Uses another file as the library, and remembers it in this vault. */
  async choose(path: string): Promise<void> {
    await this.ctx.storage.write(SETTINGS_FILE, { libraryPath: path } satisfies Settings);
    this.set({ path });
    await this.load();
  }

  async load(): Promise<void> {
    const { path } = this.snapshot;
    if (!(await this.ctx.vault.exists(path))) {
      this.refs = new Map();
      this.set({ status: 'missing', count: 0, modified: null, error: null });
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
      this.refs = library.refs;
      this.set({
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
