import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ModuleDefinition } from '../api';
import type { DeviceKind, PlatformAdapter } from '../platform';
import type { VaultConfig } from '../vault/vaultConfig';
import type { Contributions } from './contributions';
import { createModuleContext, type ModuleContextHandle } from './context';
import type { ModuleManifest } from './manifest';

/** A module the app ships with: its checked manifest and a way to load its code. */
export interface ModuleSource {
  manifest: ModuleManifest;
  load: () => Promise<ModuleDefinition>;
}

/** A module folder whose manifest or code could not be used. */
export interface BrokenModule {
  folder: string;
  errors: string[];
}

export type ModuleStatus =
  /** Switched off. */
  | 'off'
  /** Switched on and running. */
  | 'on'
  /** Switched on, but activate() failed; `error` says why. */
  | 'failed'
  /** Not built for this device. */
  | 'unavailable';

export interface ModuleInfo {
  manifest: ModuleManifest;
  status: ModuleStatus;
  error: string | null;
}

export interface RegistryState {
  modules: ModuleInfo[];
  broken: BrokenModule[];
}

/** What switching a module on or off would also change, for the UI to confirm. */
export type ChangePlan = { ok: true; ids: string[] } | { ok: false; reason: string };

export interface RegistryDeps {
  platform: PlatformAdapter;
  device: DeviceKind;
  contributions: Contributions;
}

interface Running {
  definition: ModuleDefinition;
  handle: ModuleContextHandle;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Knows every module, which are on, and starts and stops them. Changes run
 * one at a time. It never touches vault files: modules only reach the vault
 * through their context, and turning one off only disposes what it registered.
 */
export class ModuleRegistry {
  readonly store: StoreApi<RegistryState>;
  private readonly sources = new Map<string, ModuleSource>();
  private readonly running = new Map<string, Running>();
  private queue: Promise<void> = Promise.resolve();

  constructor(
    sources: readonly ModuleSource[],
    broken: readonly BrokenModule[],
    private readonly deps: RegistryDeps,
  ) {
    const extraBroken: BrokenModule[] = [];
    for (const source of sources) {
      if (this.sources.has(source.manifest.id)) {
        extraBroken.push({ folder: source.manifest.id, errors: ['Two modules share this id'] });
        continue;
      }
      this.sources.set(source.manifest.id, source);
    }
    this.store = createStore<RegistryState>()(() => ({
      modules: [...this.sources.values()].map((s) => ({
        manifest: s.manifest,
        status: this.isAvailable(s.manifest) ? 'off' : 'unavailable',
        error: null,
      })),
      broken: [...broken, ...extraBroken],
    }));
  }

  get(id: string): ModuleInfo | undefined {
    return this.store.getState().modules.find((m) => m.manifest.id === id);
  }

  /** Ids of modules that are switched on, including ones that failed to start. */
  enabledIds(): string[] {
    return this.store
      .getState()
      .modules.filter((m) => m.status === 'on' || m.status === 'failed')
      .map((m) => m.manifest.id);
  }

  /**
   * Modules to switch on for `id`, dependencies first, ending with `id`.
   * Modules already on are left out.
   */
  planEnable(id: string): ChangePlan {
    const order: string[] = [];
    const visiting = new Set<string>();
    const fail = (reason: string): ChangePlan => ({ ok: false, reason });

    const visit = (current: string, neededBy: string | null): ChangePlan | null => {
      const source = this.sources.get(current);
      if (!source) {
        const who =
          neededBy === null ? '' : `${this.sources.get(neededBy)?.manifest.name ?? neededBy} `;
        return fail(`${who}needs the "${current}" module, which is not installed`);
      }
      if (!this.isAvailable(source.manifest)) {
        return fail(`${source.manifest.name} is not available on this device`);
      }
      if (visiting.has(current)) return fail('These modules depend on each other in a loop');
      if (order.includes(current) || this.isEnabled(current)) return null;
      visiting.add(current);
      for (const dep of source.manifest.dependsOn) {
        const problem = visit(dep, current);
        if (problem) return problem;
      }
      visiting.delete(current);
      order.push(current);
      return null;
    };

    return visit(id, null) ?? { ok: true, ids: order };
  }

  /** Modules to switch off for `id`: everything on that depends on it, then `id`. */
  planDisable(id: string): ChangePlan {
    if (!this.sources.has(id)) return { ok: false, reason: `No module "${id}"` };
    const order: string[] = [];
    const visit = (current: string) => {
      if (order.includes(current)) return;
      for (const other of this.enabledIds()) {
        if (this.sources.get(other)?.manifest.dependsOn.includes(current)) visit(other);
      }
      if (this.isEnabled(current)) order.push(current);
    };
    visit(id);
    return { ok: true, ids: order };
  }

  /**
   * Switches on the modules in `ids`, in order (use planEnable to get them).
   * A module whose dependency failed is not started.
   */
  enable(ids: readonly string[]): Promise<void> {
    return this.serial(async () => {
      for (const id of ids) await this.start(id);
    });
  }

  /** Switches off the modules in `ids`, in order (use planDisable to get them). */
  disable(ids: readonly string[]): Promise<void> {
    return this.serial(async () => {
      for (const id of ids) await this.stop(id);
    });
  }

  /**
   * Starts the modules a vault has switched on, dependencies first. A module
   * with no entry in the config uses its `defaultEnabled`. One whose
   * dependencies are not all on stays off, with a note saying why.
   */
  activateFromConfig(config: VaultConfig): Promise<void> {
    return this.serial(async () => {
      const wanted = new Set(
        [...this.sources.values()]
          .filter((s) => config.modules[s.manifest.id]?.enabled ?? s.manifest.defaultEnabled)
          .map((s) => s.manifest.id),
      );
      for (const id of this.dependencyOrder()) {
        if (!wanted.has(id)) continue;
        const missing = this.sources.get(id)?.manifest.dependsOn.filter((d) => !wanted.has(d));
        if (missing && missing.length > 0) {
          this.update(id, { error: `Needs ${missing.join(', ')} to be switched on` });
          continue;
        }
        await this.start(id);
      }
    });
  }

  /** Stops every running module, dependents first. Used when a vault closes. */
  deactivateAll(): Promise<void> {
    return this.serial(async () => {
      for (const id of this.dependencyOrder().reverse()) await this.stop(id);
    });
  }

  // ---- Internals ----

  private serial(work: () => Promise<void>): Promise<void> {
    const next = this.queue.then(work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private isAvailable(manifest: ModuleManifest): boolean {
    return manifest.platforms.includes(this.deps.device);
  }

  private isEnabled(id: string): boolean {
    const status = this.get(id)?.status;
    return status === 'on' || status === 'failed';
  }

  /** Every module id, each after the modules it depends on. */
  private dependencyOrder(): string[] {
    const order: string[] = [];
    const seen = new Set<string>();
    const visit = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      for (const dep of this.sources.get(id)?.manifest.dependsOn ?? []) visit(dep);
      if (this.sources.has(id)) order.push(id);
    };
    for (const id of this.sources.keys()) visit(id);
    return order;
  }

  private update(id: string, patch: Partial<Omit<ModuleInfo, 'manifest'>>): void {
    this.store.setState((s) => ({
      modules: s.modules.map((m) => (m.manifest.id === id ? { ...m, ...patch } : m)),
    }));
  }

  private async start(id: string): Promise<void> {
    const source = this.sources.get(id);
    if (!source || this.running.has(id) || this.get(id)?.status === 'failed') return;
    if (!this.isAvailable(source.manifest)) return;
    const blocked = source.manifest.dependsOn.find((d) => this.get(d)?.status !== 'on');
    if (blocked !== undefined) {
      this.update(id, { status: 'off', error: `Needs ${blocked}, which is not running` });
      return;
    }

    const handle = createModuleContext(source.manifest, this.deps);
    try {
      const definition = await source.load();
      if (typeof definition.activate !== 'function') {
        throw new Error('index.ts must export defineModule({ activate }) as its default');
      }
      await definition.activate(handle.ctx);
      this.running.set(id, { definition, handle });
      this.update(id, { status: 'on', error: null });
    } catch (err) {
      handle.dispose();
      handle.ctx.log.error('Failed to start:', err);
      this.update(id, { status: 'failed', error: message(err) });
    }
  }

  private async stop(id: string): Promise<void> {
    const running = this.running.get(id);
    this.running.delete(id);
    if (running) {
      try {
        await running.definition.deactivate?.();
      } catch (err) {
        running.handle.ctx.log.error('Error while switching off:', err);
      }
      running.handle.dispose();
    }
    const info = this.get(id);
    if (info && info.status !== 'unavailable') this.update(id, { status: 'off', error: null });
  }
}
