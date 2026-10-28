import { useSyncExternalStore } from 'react';
import type { ModuleContext } from '@core/api';
import { FLIPS_PAGE, flipStock, flipsPage, tickedFlips } from './flips';
import { FLY_STOCK, KINDS, type ItemKind } from './kinds';

/** An inventory item: a record, with its values. */
export interface Item {
  path: string;
  /** Its name, as `[[name]]` links to it. */
  name: string;
  kind: ItemKind;
  data: Record<string, unknown>;
}

/** The inventory kind of a path, from its `.<kind>.yaml` ending, or null. */
export function kindOf(path: string): ItemKind | null {
  const lower = path.toLowerCase();
  return KINDS.find((k) => lower.endsWith(`.${k.kind}.yaml`)) ?? null;
}

function nameOf(path: string, kind: ItemKind): string {
  const base = path.split('/').at(-1) ?? path;
  return base.slice(0, base.length - `.${kind.kind}.yaml`.length);
}

/** Today as `YYYY-MM-DD`, in local time. */
export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Every inventory item, read once and kept up to date as records change;
 * and the flips page, kept in step with the fly stocks.
 */
export class InventoryStore {
  private byPath = new Map<string, Item>();
  private listeners = new Set<() => void>();
  private snapshot: Item[] = [];
  private syncing: Promise<void> = Promise.resolve();
  loaded = false;

  constructor(private readonly ctx: ModuleContext) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  all = (): Item[] => this.snapshot;

  private changed(): void {
    this.snapshot = [...this.byPath.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true }),
    );
    for (const l of this.listeners) l();
  }

  async load(): Promise<void> {
    const paths = (await this.ctx.app.items()).map((i) => i.path).filter((p) => kindOf(p));
    await Promise.all(paths.map((p) => this.read(p)));
    this.loaded = true;
    this.changed();
    await this.syncFlips();
  }

  /** After files changed on disk: records read again, and ticked flips recorded. */
  async refresh(paths: readonly string[]): Promise<void> {
    const records = paths.filter((p) => kindOf(p));
    if (records.length > 0) {
      await Promise.all(records.map((p) => this.read(p)));
      this.changed();
    }
    if (paths.includes(FLIPS_PAGE) || records.some((p) => kindOf(p) === FLY_STOCK)) {
      await this.syncFlips();
    }
  }

  private async read(path: string): Promise<void> {
    const kind = kindOf(path);
    if (!kind) return;
    try {
      if (!(await this.ctx.vault.exists(path))) {
        this.byPath.delete(path);
        return;
      }
      const { data, error } = await this.ctx.vault.readRecord(path);
      if (error === null) this.byPath.set(path, { path, name: nameOf(path, kind), kind, data });
    } catch {
      this.byPath.delete(path);
    }
  }

  /** Sets values of an item; null removes one. */
  async update(item: Item, changes: Record<string, unknown>): Promise<void> {
    await this.ctx.vault.updateRecord(item.path, changes);
    await this.refresh([item.path]);
  }

  /** Records that a fly stock was flipped today. */
  async flipped(item: Item): Promise<void> {
    await this.update(item, { lastFlipped: today() });
  }

  /** Makes a new item and opens it. */
  async create(kind: ItemKind, name: string): Promise<void> {
    await this.ctx.vault.ensureDir(kind.folder);
    const path = await this.ctx.vault.createRecord(kind.folder, name, kind.kind, {});
    await this.refresh([path]);
    await this.ctx.app.open(path);
  }

  /**
   * Records flips ticked in the flips page, then writes the page afresh
   * from the stocks. One at a time, as each write is itself a change.
   */
  syncFlips(): Promise<void> {
    this.syncing = this.syncing.then(() => this.doSyncFlips()).catch(() => undefined);
    return this.syncing;
  }

  private async doSyncFlips(): Promise<void> {
    const vault = this.ctx.vault;
    const current = (await vault.exists(FLIPS_PAGE)) ? await vault.readText(FLIPS_PAGE) : null;
    const stocks = () => this.snapshot.filter((i) => i.kind === FLY_STOCK);
    let recorded = false;
    for (const name of current === null ? [] : tickedFlips(current)) {
      const stock = stocks().find((s) => s.name.toLowerCase() === name.toLowerCase());
      if (!stock) continue;
      await vault.updateRecord(stock.path, { lastFlipped: today() });
      await this.read(stock.path);
      recorded = true;
    }
    if (recorded) this.changed();
    const flipping = stocks().map((s) => flipStock(s.name, s.data));
    // No page for a vault that flips nothing, unless there is one already.
    if (current === null && flipping.every((s) => s.flipEvery === null)) return;
    const next = flipsPage(flipping, today());
    if (next === current) return;
    await vault.ensureDir('Inventory');
    await vault.writeText(FLIPS_PAGE, next);
  }
}

export function useItems(store: InventoryStore): Item[] {
  return useSyncExternalStore(store.subscribe, store.all);
}
