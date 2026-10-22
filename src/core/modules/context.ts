import type { Disposable, ModuleContext, ModuleLogger } from '../api';
import { normaliseVaultPath, type DeviceKind, type PlatformAdapter } from '../platform';
import { VAULT_DIR } from '../vault/vaultConfig';
import type { Contributions } from './contributions';
import type { ModuleManifest } from './manifest';

export interface ContextDeps {
  platform: PlatformAdapter;
  device: DeviceKind;
  contributions: Contributions;
  /** Defaults to the console; tests pass a quiet one. */
  logger?: ModuleLogger;
}

export interface ModuleContextHandle {
  ctx: ModuleContext;
  /** Removes everything the module registered, newest first. Safe to call twice. */
  dispose(): void;
}

export function moduleDir(id: string): string {
  return `${VAULT_DIR}/modules/${id}`;
}

function storageFile(id: string, name: string): string {
  const normal = normaliseVaultPath(name);
  if (normal === '' || normal.includes('/')) {
    throw new Error(`Storage name must be a plain file name, not '${name}'`);
  }
  return `${moduleDir(id)}/${normal}`;
}

/** Builds the context handed to a module's activate(), and its clean-up. */
export function createModuleContext(
  manifest: ModuleManifest,
  deps: ContextDeps,
): ModuleContextHandle {
  const { id } = manifest;
  const cleanups: (() => void)[] = [];
  let disposed = false;

  function track(cleanup: () => void): Disposable {
    if (disposed) throw new Error(`Module '${id}' is switched off and cannot register anything`);
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      cleanup();
    };
    cleanups.push(run);
    return { dispose: run };
  }

  const base = deps.logger ?? console;
  const prefix = `[${id}]`;
  const log: ModuleLogger = {
    info: (...args) => {
      base.info(prefix, ...args);
    },
    warn: (...args) => {
      base.warn(prefix, ...args);
    },
    error: (...args) => {
      base.error(prefix, ...args);
    },
  };

  const ctx: ModuleContext = {
    manifest,
    platform: deps.device,
    log,
    views: {
      registerSidebarPanel(spec) {
        if (!spec.id.startsWith(`${id}.`)) {
          throw new Error(`Panel id '${spec.id}' must start with '${id}.'`);
        }
        const store = deps.contributions;
        if (store.getState().panels.some((p) => p.id === spec.id)) {
          throw new Error(`A panel with id '${spec.id}' is already registered`);
        }
        const panel = { ...spec, moduleId: id };
        const handle = track(() => {
          store.setState((s) => ({ panels: s.panels.filter((p) => p !== panel) }));
        });
        store.setState((s) => ({ panels: [...s.panels, panel] }));
        return handle;
      },
    },
    storage: {
      async read<T>(name: string): Promise<T | null> {
        const path = storageFile(id, name);
        if (!(await deps.platform.exists(path))) return null;
        return JSON.parse(await deps.platform.readText(path)) as T;
      },
      async write(name, data) {
        const path = storageFile(id, name);
        await deps.platform.ensureDir(moduleDir(id));
        await deps.platform.writeTextAtomic(path, `${JSON.stringify(data, null, 2)}\n`);
      },
    },
    onDispose(fn) {
      track(fn);
    },
  };

  return {
    ctx,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const cleanup of cleanups.reverse()) {
        try {
          cleanup();
        } catch (err) {
          log.error('Error while switching off:', err);
        }
      }
      cleanups.length = 0;
    },
  };
}
