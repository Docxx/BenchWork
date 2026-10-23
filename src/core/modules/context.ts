import type { Disposable, ModuleApp, ModuleContext, ModuleLogger } from '../api';
import { freeName } from '../notebooks/notebookService';
import {
  normaliseVaultPath,
  vaultPathOf,
  type DeviceKind,
  type PlatformAdapter,
} from '../platform';
import { VAULT_DIR } from '../vault/vaultConfig';
import type { Contributions, ContributionsState } from './contributions';
import type { ModuleManifest } from './manifest';

/** What the app gives modules: ModuleApp, plus the open vault's full path. */
export interface AppBridge extends ModuleApp {
  vaultRoot(): string | null;
}

export interface ContextDeps {
  platform: PlatformAdapter;
  device: DeviceKind;
  contributions: Contributions;
  /** The app, once the store has connected it. */
  app?: () => AppBridge | null;
  /** Defaults to the console; tests pass a quiet one. */
  logger?: ModuleLogger;
}

/** Lists in ContributionsState that hold registered items. */
type ListKey = 'panels' | 'pageTypes' | 'commands' | 'fileHandlers';

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

  /** Adds an item to a contributions list until the module is switched off. */
  function contribute<K extends ListKey>(
    key: K,
    item: ContributionsState[K][number],
    clash: (other: ContributionsState[K][number]) => boolean,
    what: string,
  ): Disposable {
    const store = deps.contributions;
    const list = store.getState()[key] as readonly ContributionsState[K][number][];
    if (list.some(clash)) throw new Error(`${what} is already registered`);
    const handle = track(() => {
      store.setState((s) => ({
        [key]: (s[key] as readonly unknown[]).filter((p) => p !== item),
      }));
    });
    store.setState((s) => ({ [key]: [...(s[key] as readonly unknown[]), item] }));
    return handle;
  }

  function checkId(kind: string, itemId: string): void {
    if (!itemId.startsWith(`${id}.`)) {
      throw new Error(`${kind} id '${itemId}' must start with '${id}.'`);
    }
  }

  function app(): AppBridge {
    const bridge = deps.app?.() ?? null;
    if (bridge === null) throw new Error('The app is not ready yet');
    return bridge;
  }

  const ctx: ModuleContext = {
    manifest,
    platform: deps.device,
    log,
    views: {
      registerSidebarPanel(spec) {
        checkId('Panel', spec.id);
        return contribute(
          'panels',
          { ...spec, moduleId: id },
          (p) => p.id === spec.id,
          `A panel with id '${spec.id}'`,
        );
      },
    },
    pageTypes: {
      register(spec) {
        if (!/^[a-z][a-z0-9-]*$/.test(spec.type)) {
          throw new Error(`Page type '${spec.type}' must be lower case letters, digits and -`);
        }
        if (spec.type === 'page') throw new Error("'page' is the core page type");
        return contribute(
          'pageTypes',
          { ...spec, moduleId: id },
          (t) => t.type === spec.type,
          `A page type '${spec.type}'`,
        );
      },
    },
    commands: {
      register(spec) {
        checkId('Command', spec.id);
        return contribute(
          'commands',
          { ...spec, moduleId: id },
          (c) => c.id === spec.id,
          `A command with id '${spec.id}'`,
        );
      },
    },
    files: {
      register(spec) {
        checkId('File handler', spec.id);
        const extensions = spec.extensions.map((e) => e.toLowerCase());
        if (extensions.some((e) => !/^\.[a-z0-9.-]+$/.test(e) || e.endsWith('.md'))) {
          throw new Error(`File handler '${spec.id}' has an ending it cannot use`);
        }
        return contribute(
          'fileHandlers',
          { ...spec, extensions, moduleId: id },
          (h) => h.id === spec.id || h.extensions.some((e) => extensions.includes(e)),
          `A file handler for ${extensions.join(', ')}`,
        );
      },
    },
    vault: {
      listDir: (path) => deps.platform.listDir(path),
      exists: (path) => deps.platform.exists(path),
      readText: (path) => deps.platform.readText(path),
      writeText: (path, text) => deps.platform.writeTextAtomic(path, text),
      createNew: (path, text) => deps.platform.createNew(path, text),
      ensureDir: (path) => deps.platform.ensureDir(path),
      freeName: (folder, base, ext) => freeName(deps.platform, folder, base, ext),
      fileInfo: (path, external) => deps.platform.fileInfo(path, external),
      hashFile: (path, external) => deps.platform.hashFile(path, external),
      pickFiles: (options) => deps.platform.pickFiles(options),
      vaultPathOf: (fullPath) => {
        const root = app().vaultRoot();
        return root === null ? null : vaultPathOf(root, fullPath);
      },
      watch(listener) {
        const stop = deps.platform.watch(listener);
        return track(stop);
      },
    },
    app: {
      open: (path) => app().open(path),
      createFolder: (folder, title) => app().createFolder(folder, title),
      createPage: (folder, title, type) => app().createPage(folder, title, type),
      askText: (options) => app().askText(options),
      notify: (message) => {
        app().notify(message);
      },
      items: () => app().items(),
      linksTo: (path) => app().linksTo(path),
      linkTarget: (path) => app().linkTarget(path),
      resolveLink: (target, from) => app().resolveLink(target, from),
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
