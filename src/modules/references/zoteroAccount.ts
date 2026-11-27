import type { ModuleContext } from '@core/api';
import { parseLibrary } from './library';
import type { LibraryState } from './state';
import {
  checkKey,
  readLibraryFile,
  syncLibrary,
  ZOTERO_LIBRARY,
  type ZoteroAccount,
} from './zoteroWeb';

/** In this device's secure storage only; never in the vault. */
const ACCOUNT = 'zotero-account';
/** Opening the library again within this time does not sync again. */
const QUIET_MS = 2 * 60 * 1000;

export interface ZoteroStatus {
  /** Whose account this device is connected to, or null. */
  account: { userId: string; username: string } | null;
  syncing: boolean;
  /** When this device last synced, in ms. */
  lastSynced: number | null;
  error: string | null;
}

/**
 * This device's connection to a Zotero account. Syncing writes the vault
 * copy, which then syncs with the vault, so a device without a key still
 * sees the library another device fetched.
 */
export class ZoteroConnection {
  private status: ZoteroStatus = { account: null, syncing: false, lastSynced: null, error: null };
  private account: ZoteroAccount | null = null;
  private readonly listeners = new Set<() => void>();
  private running: Promise<void> | null = null;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly library: LibraryState,
  ) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly current = (): ZoteroStatus => this.status;

  private set(next: Partial<ZoteroStatus>): void {
    this.status = { ...this.status, ...next };
    for (const listener of this.listeners) listener();
  }

  private readonly loaded: Promise<void> = Promise.resolve().then(async () => {
    const saved = await this.ctx.deviceStorage.read<ZoteroAccount>(ACCOUNT).catch(() => null);
    if (saved?.key && saved.userId) {
      this.account = saved;
      this.set({ account: { userId: saved.userId, username: saved.username } });
    }
  });

  /** Checks the key, remembers it on this device, syncs, and reads the library from Zotero. */
  async connect(key: string): Promise<void> {
    await this.loaded;
    this.set({ error: null });
    try {
      const account = await checkKey((u) => this.ctx.web.getText(u), key);
      await this.ctx.deviceStorage.write(ACCOUNT, account);
      this.account = account;
      this.set({ account: { userId: account.userId, username: account.username } });
    } catch (err) {
      this.set({ error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
    await this.sync();
    if (this.status.error === null) await this.library.useZotero(true);
  }

  /** Forgets the key on this device and goes back to the Better BibTeX file. The vault copy stays. */
  async disconnect(): Promise<void> {
    await this.loaded;
    await this.ctx.deviceStorage.remove(ACCOUNT);
    this.account = null;
    this.set({ account: null, error: null, lastSynced: null });
    await this.library.useZotero(false);
  }

  /** Syncs unless this device synced in the last two minutes. */
  async syncIfStale(): Promise<void> {
    await this.loaded;
    const last = this.status.lastSynced;
    if (this.account && (last === null || Date.now() - last > QUIET_MS)) await this.sync();
  }

  /** Fetches what changed in Zotero and updates the vault copy. One at a time. */
  async sync(): Promise<void> {
    await this.loaded;
    if (!this.account) return;
    if (this.running) return this.running;
    this.running = this.run(this.account).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(account: ZoteroAccount): Promise<void> {
    const { vault } = this.ctx;
    this.set({ syncing: true, error: null });
    try {
      const read = async (path: string) =>
        (await vault.exists(path)) ? vault.readText(path) : null;
      const previous = readLibraryFile(await read(ZOTERO_LIBRARY));
      const fileText = await read(this.library.current().filePath).catch(() => null);
      const fallback = fileText === null ? [] : parseLibrary(fileText).refs.values();
      const next = await syncLibrary((u) => this.ctx.web.getText(u), account, previous, fallback);
      const text = JSON.stringify(next, null, 1) + '\n';
      if (await vault.exists(ZOTERO_LIBRARY)) await vault.writeText(ZOTERO_LIBRARY, text);
      else {
        await vault.ensureDir(ZOTERO_LIBRARY.slice(0, ZOTERO_LIBRARY.lastIndexOf('/')));
        await vault.createNew(ZOTERO_LIBRARY, text);
      }
      this.set({ lastSynced: Date.now() });
      if (this.library.current().zotero) await this.library.load();
    } catch (err) {
      this.set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.set({ syncing: false });
    }
  }
}
