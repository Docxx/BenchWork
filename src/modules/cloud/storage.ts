import type { ModuleContext, VerifiedCopy } from '@core/api';
export const PROVIDERS = [
  'OneDrive',
  'Dropbox',
  'Google Drive',
  'Network drive',
  'Other synced folder',
] as const;
export type Provider = (typeof PROVIDERS)[number];
export interface Connection {
  id: string;
  provider: Provider;
  name: string;
  /** The folder on this device: its own choice if it made one, else the shared address. */
  folder: string;
  /** The address kept with the vault, as first chosen; the same on every device. */
  shared?: string;
  /** This device uses a folder of its own for the connection. */
  own?: boolean;
}
export function relativeStoragePath(copy: VerifiedCopy): string {
  const folder = copy.folder.replaceAll('\\', '/').replace(/\/+$/, '');
  const target = copy.target.replaceAll('\\', '/');
  if (!target.startsWith(`${folder}/`))
    throw new Error('The copied file is outside its storage folder.');
  return target.slice(folder.length + 1);
}
export function parseConnections(value: unknown): Connection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v: unknown) => {
    if (!v || typeof v !== 'object') return [];
    const c = v as Record<string, unknown>;
    return typeof c['id'] === 'string' &&
      typeof c['name'] === 'string' &&
      typeof c['folder'] === 'string' &&
      PROVIDERS.includes(c['provider'] as Provider)
      ? [{ id: c['id'], name: c['name'], folder: c['folder'], provider: c['provider'] as Provider }]
      : [];
  });
}
const SHARED = 'connections.json';
const OWN = 'folders';

/**
 * The storage connections. The list is kept with the vault, so a network
 * drive added on one device is there on the others; a device that reaches
 * it by another path keeps that path for itself. Connections from before
 * they were shared, kept on one device, are moved into the vault's list.
 */
export async function loadConnections(ctx: ModuleContext): Promise<Connection[]> {
  let shared = parseConnections(await ctx.storage.read(SHARED).catch(() => null));
  const before = parseConnections(await ctx.deviceStorage.read('connections').catch(() => null));
  const missing = before.filter((b) => !shared.some((s) => s.id === b.id));
  if (missing.length > 0) {
    shared = [...shared, ...missing];
    await ctx.storage.write(
      SHARED,
      shared.map(({ id, provider, name, folder }) => ({ id, provider, name, folder })),
    );
  }
  const own = await ownFolders(ctx);
  return shared.map((c) => ({
    ...c,
    shared: c.folder,
    folder: own[c.id] ?? c.folder,
    own: own[c.id] !== undefined,
  }));
}

async function ownFolders(ctx: ModuleContext): Promise<Record<string, string>> {
  const raw = await ctx.deviceStorage.read(OWN).catch(() => null);
  if (typeof raw !== 'object' || raw === null) return {};
  return Object.fromEntries(
    Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string'),
  );
}

/** Saves the list with the vault, for every device. */
export async function saveConnections(
  ctx: ModuleContext,
  connections: readonly Connection[],
): Promise<void> {
  await ctx.storage.write(
    SHARED,
    connections.map((c) => ({
      id: c.id,
      provider: c.provider,
      name: c.name,
      folder: c.shared ?? c.folder,
    })),
  );
}

/** Sets, or with null clears, the folder this device uses for a connection. */
export async function setOwnFolder(
  ctx: ModuleContext,
  id: string,
  folder: string | null,
): Promise<void> {
  const own = Object.fromEntries(Object.entries(await ownFolders(ctx)).filter(([k]) => k !== id));
  if (folder !== null) own[id] = folder;
  await ctx.deviceStorage.write(OWN, own);
}

/** Whether this device can see a connection's folder now. */
export async function reachable(ctx: ModuleContext, connection: Connection): Promise<boolean> {
  try {
    await ctx.vault.fileInfo(connection.folder, true);
    return true;
  } catch {
    return false;
  }
}

/**
 * Where a stored file is on this device, from its record and its
 * connection, for a device that did not make the copy itself.
 */
export function locate(
  data: Record<string, unknown>,
  connections: readonly Connection[],
): VerifiedCopy | null {
  const connection = connections.find((c) => c.id === data['connectionId']);
  const path = data['storagePath'];
  if (!connection || typeof path !== 'string' || path === '' || path.includes('..')) return null;
  const folder = connection.folder.replace(/[\\/]+$/, '');
  const sep = folder.includes('\\') ? '\\' : '/';
  return {
    source: '',
    folder,
    target: `${folder}${sep}${path.replaceAll('/', sep)}`,
    size: typeof data['size'] === 'number' ? data['size'] : 0,
    sha256: typeof data['sha256'] === 'string' ? data['sha256'] : '',
  };
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const unit = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** unit).toFixed(1)} ${['B', 'KB', 'MB', 'GB'][unit] ?? 'GB'}`;
}
export async function copyFile(
  ctx: ModuleContext,
  connection: Connection,
  source: string,
  dataset: string,
  id: string,
): Promise<string> {
  if (!ctx.fileTransfers) throw new Error('Copy large files from the desktop app.');
  const folder = 'Research/Cloud';
  await ctx.vault.ensureDir(folder);
  const path = await ctx.vault.createRecord(
    folder,
    source.split(/[\\/]/).at(-1) ?? 'Stored data',
    'cloud',
    {
      source,
      provider: connection.provider,
      account: connection.name,
      connectionId: connection.id,
      dataset: dataset ? `[[${dataset}]]` : '',
      status: 'copying',
      cloudSync: 'unconfirmed',
    },
  );
  try {
    const copy = await ctx.fileTransfers.copy(id, source, connection.folder);
    const receipts = (await ctx.deviceStorage.read<Record<string, VerifiedCopy>>('receipts')) ?? {};
    await ctx.deviceStorage.write('receipts', { ...receipts, [path]: copy });
    await ctx.vault.updateRecord(path, {
      status: 'verified',
      size: copy.size,
      sha256: copy.sha256,
      storagePath: relativeStoragePath(copy),
      verifiedAt: new Date().toISOString(),
      sourceRemoved: false,
    });
    return path;
  } catch (err) {
    await ctx.vault.updateRecord(path, {
      status: /cancelled/i.test(err instanceof Error ? err.message : String(err))
        ? 'cancelled'
        : 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
/** A vault cannot change while a copy, verification or source removal is still writing its record. */
export class CloudSession {
  private closed = false;
  private active: { id: string; pending: Promise<unknown>; cancellable: boolean } | null = null;
  constructor(private readonly ctx: ModuleContext) {}
  current() {
    return this.active;
  }
  perform<T>(action: (id: string) => Promise<T>, cancellable = false): Promise<T> {
    if (this.closed || this.active)
      return Promise.reject(new Error('Wait for the current storage operation to finish.'));
    const id = crypto.randomUUID();
    const pending = action(id).finally(() => {
      this.active = null;
    });
    this.active = { id, pending, cancellable };
    return pending;
  }
  async cancel() {
    const active = this.active;
    if (!active) return;
    const stop = () => this.ctx.fileTransfers?.cancel(active.id).catch(() => undefined);
    const timer = setInterval(() => {
      void stop();
    }, 150);
    try {
      await stop();
      await active.pending.catch(() => undefined);
    } finally {
      clearInterval(timer);
    }
  }
  async close() {
    this.closed = true;
    await this.cancel();
  }
}
