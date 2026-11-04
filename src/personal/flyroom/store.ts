import { useSyncExternalStore } from 'react';
import type { ModuleContext } from '@core/api';
import { DEFAULT_MARKERS, type Marker } from './genetics';
import {
  CROSS_FOLDER,
  CROSS_KIND,
  readCross,
  readStock,
  safeName,
  STOCK_FOLDER,
  STOCK_KIND,
  type Cross,
  type ImportedStock,
  type Stock,
} from './records';
import { DEFAULT_TIMINGS, TEMPERATURES, type Temperature, type Timing } from './schedule';

/** Today as `YYYY-MM-DD`, in local time. */
export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Fly room's settings, kept in the module's own folder in the vault. */
export interface FlySettings {
  markers: Marker[];
  timings: Record<Temperature, Timing>;
}

export function defaultSettings(): FlySettings {
  return { markers: [...DEFAULT_MARKERS], timings: { ...DEFAULT_TIMINGS } };
}

/** Settings as saved, with anything missing or odd back to the default. */
export function parseSettings(raw: unknown): FlySettings {
  const settings = defaultSettings();
  if (typeof raw !== 'object' || raw === null) return settings;
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r['markers'])) {
    const markers = r['markers']
      .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
      .map((m) => ({
        name: (typeof m['name'] === 'string' ? m['name'] : '').trim(),
        shows: (typeof m['shows'] === 'string' ? m['shows'] : '').trim(),
        short: (typeof m['short'] === 'string' ? m['short'] : '').trim(),
        balancer: m['balancer'] === true,
        lethal: m['lethal'] === true,
      }))
      .filter((m) => m.name !== '');
    if (markers.length > 0) settings.markers = markers;
  }
  const timings = r['timings'];
  if (typeof timings === 'object' && timings !== null) {
    for (const t of TEMPERATURES) {
      const v = (timings as Record<string, unknown>)[String(t)];
      if (typeof v !== 'object' || v === null) continue;
      const n = (key: keyof Timing) => {
        const x = Number((v as Record<string, unknown>)[key]);
        return Number.isFinite(x) && x > 0 && x < 100 ? Math.round(x) : DEFAULT_TIMINGS[t][key];
      };
      settings.timings[t] = {
        flip: n('flip'),
        hatch: n('hatch'),
        last: n('last'),
        virginHours: n('virginHours'),
      };
    }
  }
  return settings;
}

const SETTINGS = 'settings.json';

interface Snapshot {
  stocks: Stock[];
  crosses: Cross[];
  settings: FlySettings;
  loaded: boolean;
}

function kindOf(path: string): 'stock' | 'cross' | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(`.${STOCK_KIND}.yaml`)) return 'stock';
  if (lower.endsWith(`.${CROSS_KIND}.yaml`)) return 'cross';
  return null;
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true });

/**
 * Every fly stock and cross in the vault, read once and kept up to date
 * as their files change, and Fly room's settings.
 */
export class FlyStore {
  private stocks = new Map<string, Stock>();
  private crosses = new Map<string, Cross>();
  private listeners = new Set<() => void>();
  private snap: Snapshot = { stocks: [], crosses: [], settings: defaultSettings(), loaded: false };

  constructor(private readonly ctx: ModuleContext) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  snapshot = (): Snapshot => this.snap;

  private changed(patch: Partial<Snapshot> = {}): void {
    this.snap = {
      ...this.snap,
      stocks: [...this.stocks.values()].sort(byName),
      crosses: [...this.crosses.values()].sort(
        (a, b) => b.setUp.localeCompare(a.setUp) || byName(a, b),
      ),
      ...patch,
    };
    for (const l of this.listeners) l();
  }

  async load(): Promise<void> {
    const settings = parseSettings(await this.ctx.storage.read(SETTINGS).catch(() => null));
    const paths = (await this.ctx.app.items()).map((i) => i.path).filter((p) => kindOf(p));
    await Promise.all(paths.map((p) => this.read(p)));
    this.changed({ settings, loaded: true });
  }

  async refresh(paths: readonly string[]): Promise<void> {
    const records = paths.filter((p) => kindOf(p));
    if (records.length === 0) return;
    await Promise.all(records.map((p) => this.read(p)));
    this.changed();
  }

  private async read(path: string): Promise<void> {
    const kind = kindOf(path);
    const map = kind === 'stock' ? this.stocks : this.crosses;
    try {
      if (!(await this.ctx.vault.exists(path))) {
        map.delete(path);
        return;
      }
      const { data, error } = await this.ctx.vault.readRecord(path);
      if (error !== null) return;
      if (kind === 'stock') this.stocks.set(path, readStock(path, data));
      else this.crosses.set(path, readCross(path, data));
    } catch {
      map.delete(path);
    }
  }

  async saveSettings(settings: FlySettings): Promise<void> {
    await this.ctx.storage.write(SETTINGS, settings);
    this.changed({ settings });
  }

  /** Sets values of a stock or cross; null removes one. */
  async update(path: string, changes: Record<string, unknown>): Promise<void> {
    await this.ctx.vault.updateRecord(path, changes);
    await this.refresh([path]);
  }

  async createStock(name: string, data: Record<string, unknown>): Promise<string> {
    await this.ctx.vault.ensureDir(STOCK_FOLDER);
    const path = await this.ctx.vault.createRecord(STOCK_FOLDER, safeName(name), STOCK_KIND, data);
    await this.refresh([path]);
    return path;
  }

  async createCross(name: string, data: Record<string, unknown>): Promise<string> {
    await this.ctx.vault.ensureDir(CROSS_FOLDER);
    const path = await this.ctx.vault.createRecord(CROSS_FOLDER, safeName(name), CROSS_KIND, data);
    await this.refresh([path]);
    return path;
  }

  /**
   * Adds imported stocks, skipping any whose name or genotype is already a
   * stock. Returns how many were added and skipped.
   */
  async importStocks(
    stocks: readonly ImportedStock[],
  ): Promise<{ added: number; skipped: number }> {
    const names = new Set(this.snap.stocks.map((s) => s.name.toLowerCase()));
    const genotypes = new Set(
      this.snap.stocks.map((s) => s.genotype.replace(/\s+/g, '')).filter((g) => g !== ''),
    );
    let added = 0;
    let skipped = 0;
    await this.ctx.vault.ensureDir(STOCK_FOLDER);
    for (const s of stocks) {
      const genotype =
        typeof s.data['genotype'] === 'string' ? s.data['genotype'].replace(/\s+/g, '') : '';
      if (names.has(s.name.toLowerCase()) || (genotype !== '' && genotypes.has(genotype))) {
        skipped += 1;
        continue;
      }
      const path = await this.ctx.vault.createRecord(STOCK_FOLDER, s.name, STOCK_KIND, s.data);
      await this.read(path);
      names.add(s.name.toLowerCase());
      if (genotype !== '') genotypes.add(genotype);
      added += 1;
    }
    this.changed();
    return { added, skipped };
  }
}

export function useFly(store: FlyStore): Snapshot {
  return useSyncExternalStore(store.subscribe, store.snapshot);
}
