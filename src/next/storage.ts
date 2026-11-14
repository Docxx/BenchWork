import { MemoryAdapter } from '@core/platform/memory';

export interface StudioArchive {
  format: 'benchwork-next';
  version: 1;
  entries: { path: string; data: string | null }[];
}
const DATABASE = 'benchwork-next-studio-v1';
export const STUDIO_ROOT = 'memory://BenchWork Next';
export const WORKSPACE_FILE = '.benchwork/next/workspace.json';

function base64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 16384)
    text += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(text);
}
export function archiveOf(memory: MemoryAdapter): StudioArchive {
  return {
    format: 'benchwork-next',
    version: 1,
    entries: Object.keys(memory.snapshot()).map((path) => {
      const bytes = memory.bytesOf(path);
      return { path, data: bytes === null ? null : base64(bytes) };
    }),
  };
}
function validBase64(text: string): boolean {
  if (text.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(text)) return false;
  const padding = text.indexOf('=');
  return padding === -1 || (padding >= text.length - 2 && /^={1,2}$/.test(text.slice(padding)));
}
export function validateArchive(value: unknown): StudioArchive {
  if (!value || typeof value !== 'object')
    throw new Error('Choose a BenchWork Next workspace export.');
  const a = value as Record<string, unknown>;
  if (
    a['format'] !== 'benchwork-next' ||
    a['version'] !== 1 ||
    !Array.isArray(a['entries']) ||
    a['entries'].length > 5000
  )
    throw new Error('This workspace format is not supported.');
  const paths = new Set<string>();
  for (const item of a['entries']) {
    if (!item || typeof item !== 'object') throw new Error('An exported file is invalid.');
    const e = item as Record<string, unknown>;
    const p = e['path'];
    if (
      typeof p !== 'string' ||
      !p ||
      p.startsWith('/') ||
      p.includes('\\') ||
      p.includes(':') ||
      p.split('/').some((part) => part === '.' || part === '..' || part === '') ||
      paths.has(p.toLowerCase())
    )
      throw new Error('The export contains an unsafe or repeated file path.');
    if (e['data'] !== null && (typeof e['data'] !== 'string' || !validBase64(e['data'])))
      throw new Error('An exported file has invalid content.');
    paths.add(p.toLowerCase());
  }
  if (!paths.has(WORKSPACE_FILE)) throw new Error('The export is missing its studio workspace.');
  return value as StudioArchive;
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspace');
    request.onerror = () => {
      reject(new Error('Device storage could not be opened.'));
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}
export async function readArchive(): Promise<StudioArchive | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db
        .transaction('workspace', 'readonly')
        .objectStore('workspace')
        .get('current');
      request.onsuccess = () => {
        try {
          resolve(request.result ? validateArchive(request.result) : null);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };
      request.onerror = () => {
        reject(new Error('Your saved studio could not be read.'));
      };
    });
  } finally {
    db.close();
  }
}
export async function writeArchive(archive: StudioArchive): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('workspace', 'readwrite');
      tx.objectStore('workspace').put(archive, 'current');
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        reject(
          new Error('Device storage is full or unavailable. Export your workspace to keep a copy.'),
        );
      };
      tx.onabort = () => {
        reject(new Error('The studio save was interrupted. Please retry.'));
      };
    });
  } finally {
    db.close();
  }
}
export async function restoreArchive(memory: MemoryAdapter, archive: StudioArchive): Promise<void> {
  for (const entry of archive.entries.filter((e) => e.data === null))
    await memory.ensureDir(entry.path);
  for (const entry of archive.entries) {
    if (entry.data === null) continue;
    const slash = entry.path.lastIndexOf('/');
    if (slash > 0) await memory.ensureDir(entry.path.slice(0, slash));
    await memory.writeBytes(
      entry.path,
      Uint8Array.from(atob(entry.data), (c) => c.charCodeAt(0)),
    );
  }
}

export type SaveStatus = 'saved' | 'saving' | 'error';
/** The existing BenchWork platform, backed by an isolated, durable browser database. */
export class StudioAdapter extends MemoryAdapter {
  private armed = false;
  private pending: Promise<void> = Promise.resolve();
  private saveListeners = new Set<() => void>();
  status: SaveStatus = 'saved';
  error: string | null = null;

  enablePersistence(): void {
    this.armed = true;
  }
  subscribe(listener: () => void): () => void {
    this.saveListeners.add(listener);
    return () => {
      this.saveListeners.delete(listener);
    };
  }
  private report(status: SaveStatus, error: string | null = null): void {
    this.status = status;
    this.error = error;
    for (const listener of this.saveListeners) listener();
  }
  checkpoint(): Promise<void> {
    if (!this.armed) return Promise.resolve();
    this.report('saving');
    const archive = archiveOf(this);
    const save = this.pending.catch(() => undefined).then(() => writeArchive(archive));
    this.pending = save;
    void save.then(
      () => {
        if (this.pending === save) this.report('saved');
      },
      (err: unknown) => {
        if (this.pending === save)
          this.report('error', err instanceof Error ? err.message : String(err));
      },
    );
    return save;
  }
  async settled(): Promise<void> {
    await this.pending;
  }
  override async writeTextAtomic(path: string, text: string): Promise<void> {
    await super.writeTextAtomic(path, text);
    await this.checkpoint();
  }
  override async writeBytes(path: string, bytes: Uint8Array): Promise<void> {
    await super.writeBytes(path, bytes);
    await this.checkpoint();
  }
  override async createNew(path: string, text: string): Promise<void> {
    await super.createNew(path, text);
    await this.checkpoint();
  }
  override async rename(from: string, to: string): Promise<void> {
    await super.rename(from, to);
    await this.checkpoint();
  }
  override async trash(path: string): Promise<void> {
    await super.trash(path);
    await this.checkpoint();
  }
}
