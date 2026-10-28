import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { PlatformError } from './errors';
import type {
  DeviceKind,
  DirEntry,
  FileInfo,
  FolderBrowser,
  PandocWordOptions,
  PlatformAdapter,
  SearchIndex,
  VaultChange,
  VaultOwner,
} from './types';
import { normaliseVaultPath } from './vaultPath';

/** Matches CHANGE_EVENT in src-tauri/src/watcher.rs. */
const CHANGE_EVENT = 'vault-change';

/**
 * Runs a command, turning failures into PlatformErrors. Arguments are built
 * lazily so a path that fails `normaliseVaultPath` becomes a rejected
 * promise rather than a synchronous throw.
 */
async function call<T>(command: string, args?: () => Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args?.());
  } catch (err) {
    throw PlatformError.from(err);
  }
}

/** What MainActivity.kt gives the page on Android. */
interface AndroidBridge {
  setHandwriting(on: boolean): void;
  hasAllFilesAccess(): boolean;
  askAllFilesAccess(): void;
  sharedStorage(): string;
}

declare global {
  interface Window {
    BenchWorkAndroid?: AndroidBridge;
  }
}

/** On Android, vault folders are chosen inside the app, by full path. */
function androidFolderBrowser(): FolderBrowser | null {
  const bridge = window.BenchWorkAndroid;
  if (!bridge) return null;
  return {
    start: bridge.sharedStorage(),
    folders: (path) => call<string[]>('list_folders', () => ({ path })),
    makeFolder: (path) => call<undefined>('make_folder', () => ({ path })),
    hasAccess: () => bridge.hasAllFilesAccess(),
    askAccess: () => {
      bridge.askAllFilesAccess();
    },
  };
}

function detectKind(): DeviceKind {
  return /Android/i.test(navigator.userAgent) ? 'tablet' : 'desktop';
}

/** Joins a vault-relative path onto the vault's full path, with its separator. */
export function fullPath(root: string, path: string): string {
  if (path === '') return root;
  const sep = root.includes('\\') ? '\\' : '/';
  const base = root.endsWith(sep) ? root.slice(0, -1) : root;
  return `${base}${sep}${path.split('/').join(sep)}`;
}

/**
 * Talks to the Rust commands in src-tauri/src/lib.rs. Paths are checked here
 * first for quick, consistent errors; the Rust path guard checks them again
 * and is the real boundary.
 */
/** The search index commands in src-tauri/src/lib.rs. */
const tauriIndex: SearchIndex = {
  open: () => call('index_open'),
  close: () => call('index_close'),
  entries: () => call('index_entries'),
  apply: (upserts, removes) => call('index_apply', () => ({ upserts, removes })),
  clear: () => call('index_clear'),
  search: (query, limit) => call('index_search', () => ({ query, limit })),
  backlinks: (keys) => call('index_backlinks', () => ({ keys })),
  pages: () => call('index_pages'),
  tags: () => call('index_tags'),
  tagged: (tag, limit) => call('index_tagged', () => ({ tag, limit })),
};

export class TauriAdapter implements PlatformAdapter {
  readonly kind: DeviceKind = detectKind();
  readonly folderBrowser: FolderBrowser | null = androidFolderBrowser();

  setStylusHandwriting(on: boolean): void {
    window.BenchWorkAndroid?.setHandwriting(on);
  }
  readonly index = tauriIndex;
  /** Full path of the open vault, as Rust reported it. */
  private root: string | null = null;

  async pickFolder(options: { title: string }): Promise<string | null> {
    try {
      const picked = await open({ directory: true, multiple: false, title: options.title });
      return typeof picked === 'string' ? picked : null;
    } catch (err) {
      throw PlatformError.from(err);
    }
  }

  findVaultRoot(path: string): Promise<VaultOwner | null> {
    return call('find_vault_root', () => ({ path }));
  }

  async setVaultRoot(root: string): Promise<string> {
    const display = await call<string>('set_vault_root', () => ({ root }));
    this.root = display;
    return display;
  }

  listDir(path: string): Promise<DirEntry[]> {
    return call('list_dir', () => ({ path: normaliseVaultPath(path) }));
  }

  readText(path: string): Promise<string> {
    return call('read_text', () => ({ path: normaliseVaultPath(path) }));
  }

  writeTextAtomic(path: string, text: string): Promise<void> {
    return call('write_text_atomic', () => ({ path: normaliseVaultPath(path), text }));
  }

  ensureDir(path: string): Promise<void> {
    return call('ensure_dir', () => ({ path: normaliseVaultPath(path) }));
  }

  exists(path: string): Promise<boolean> {
    return call('exists', () => ({ path: normaliseVaultPath(path) }));
  }

  createNew(path: string, text: string): Promise<void> {
    return call('create_new', () => ({ path: normaliseVaultPath(path), text }));
  }

  rename(from: string, to: string): Promise<void> {
    return call('rename', () => ({ from: normaliseVaultPath(from), to: normaliseVaultPath(to) }));
  }

  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    try {
      // Sent as the raw body; the path goes in a header, encoded because
      // header values must be ASCII.
      const header = encodeURIComponent(normaliseVaultPath(path));
      await invoke('write_bytes', data, { headers: { 'x-vault-path': header } });
    } catch (err) {
      throw PlatformError.from(err);
    }
  }

  copyIn(externalPath: string, to: string, maxBytes: number): Promise<number> {
    return call('copy_in', () => ({
      external: externalPath,
      to: normaliseVaultPath(to),
      maxBytes,
    }));
  }

  async pickFiles(options: { title: string; multiple: boolean }): Promise<string[]> {
    try {
      const picked = await open({ multiple: options.multiple, title: options.title });
      if (picked === null) return [];
      return Array.isArray(picked) ? picked : [picked];
    } catch (err) {
      throw PlatformError.from(err);
    }
  }

  async readBytes(path: string, maxBytes: number): Promise<Uint8Array> {
    // Rust sends the bytes back raw, which arrive as an ArrayBuffer.
    const data = await call<ArrayBuffer | number[]>('read_bytes', () => ({
      path: normaliseVaultPath(path),
      maxBytes,
    }));
    return data instanceof ArrayBuffer ? new Uint8Array(data) : Uint8Array.from(data);
  }

  fileInfo(path: string, external = false): Promise<FileInfo> {
    return call('file_info', () => ({
      path: external ? path : normaliseVaultPath(path),
      external,
    }));
  }

  hashFile(path: string, external = false): Promise<string> {
    return call('hash_file', () => ({
      path: external ? path : normaliseVaultPath(path),
      external,
    }));
  }

  pandocVersion(): Promise<string | null> {
    return call('pandoc_version');
  }

  pandocToWord(options: PandocWordOptions): Promise<void> {
    return call('pandoc_to_word', () => ({
      markdown: options.markdown,
      output: normaliseVaultPath(options.output),
      bibliography:
        options.bibliography === undefined ? null : normaliseVaultPath(options.bibliography),
      csl: options.csl === undefined ? null : normaliseVaultPath(options.csl),
    }));
  }

  trash(path: string): Promise<void> {
    return call('trash', () => ({ path: normaliseVaultPath(path) }));
  }

  removeSnapshot(path: string): Promise<void> {
    return call('remove_snapshot', () => ({ path: normaliseVaultPath(path) }));
  }

  watch(listener: (change: VaultChange) => void): () => void {
    let stopped = false;
    let unlisten: (() => void) | null = null;
    void listen<{ root: string; paths: string[] }>(CHANGE_EVENT, (event) => {
      // Ignore changes from a vault that has since been closed.
      if (event.payload.root === this.root) listener({ paths: event.payload.paths });
    }).then((fn) => {
      if (stopped) fn();
      else unlisten = fn;
    });
    return () => {
      stopped = true;
      unlisten?.();
    };
  }

  assetUrl(path: string): string | null {
    if (this.root === null) return null;
    return convertFileSrc(fullPath(this.root, normaliseVaultPath(path)));
  }

  onExitRequested(handler: () => Promise<void>): () => void {
    const win = getCurrentWindow();
    let stopped = false;
    let unlisten: (() => void) | null = null;
    void win
      .onCloseRequested(async (event) => {
        // Hold the window open until the work is saved, then close it.
        event.preventDefault();
        try {
          await handler();
        } finally {
          await win.destroy();
        }
      })
      .then((fn) => {
        if (stopped) fn();
        else unlisten = fn;
      });
    return () => {
      stopped = true;
      unlisten?.();
    };
  }

  loadAppSettings(): Promise<unknown> {
    return call('load_app_settings');
  }

  saveAppSettings(settings: unknown): Promise<void> {
    return call('save_app_settings', () => ({ settings }));
  }
}
