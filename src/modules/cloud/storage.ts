import type { ModuleContext, VerifiedCopy } from '@core/api';
export const PROVIDERS = ['OneDrive', 'Dropbox', 'Google Drive', 'Other synced folder'] as const;
export type Provider = (typeof PROVIDERS)[number];
export interface Connection {
  id: string;
  provider: Provider;
  name: string;
  folder: string;
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
