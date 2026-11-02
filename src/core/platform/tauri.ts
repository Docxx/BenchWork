import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { PlatformError } from './errors';
import type {
  NativeSyncAdapter,
  SyncConnection,
  SyncHostStatus,
  SyncInvitation,
  SyncPairing,
  SyncReport,
  HttpRequest,
  HttpResponse,
  DeviceKind,
  DirEntry,
  FileInfo,
  MaterialFiles,
  AudienceDisplay,
  ImportedSlides,
  DisplayInfo,
  FileTransfers,
  VerifiedCopy,
  FolderBrowser,
  BackupFile,
  VaultBackups,
  HandwritingRecognizer,
  ProgramResult,
  ProgramRunner,
  PandocWordOptions,
  PlatformAdapter,
  SearchIndex,
  VaultChange,
  VaultOwner,
  WindowFrame,
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
  openFeedbackEmail(subject: string, body: string): string;
  readSyncPairing(source: string): string;
  secureRead(key: string): string;
  secureWrite(key: string, value: string, remove: boolean): string;
  setHandwriting(on: boolean): void;
  inkModelReady(id: string): void;
  inkPrepare(id: string): void;
  inkRecognise(id: string, strokesJson: string): void;
  hasAllFilesAccess(): boolean;
  askAllFilesAccess(): void;
  openLink(url: string): void;
  sharedStorage(): string;
}

declare global {
  interface Window {
    BenchWorkAndroid?: AndroidBridge;
    /** MainActivity.kt answers handwriting requests through this. */
    __benchworkInkReply?: (id: string, ok: boolean, value: unknown) => void;
  }
}

/** Handwriting to text with ML Kit, through MainActivity.kt; null off Android. */
function androidHandwriting(): HandwritingRecognizer | null {
  const bridge = window.BenchWorkAndroid;
  if (!bridge) return null;
  const waiting = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let next = 0;
  window.__benchworkInkReply = (id, ok, value) => {
    const w = waiting.get(id);
    if (!w) return;
    waiting.delete(id);
    if (ok) w.resolve(value);
    else w.reject(new Error(typeof value === 'string' ? value : 'Handwriting could not be read'));
  };
  const ask = (send: (id: string) => void) =>
    new Promise<unknown>((resolve, reject) => {
      next += 1;
      const id = String(next);
      waiting.set(id, { resolve, reject });
      send(id);
    });
  return {
    ready: async () =>
      (await ask((id) => {
        bridge.inkModelReady(id);
      })) === true,
    prepare: async () => {
      await ask((id) => {
        bridge.inkPrepare(id);
      });
    },
    recognise: async (strokes) => {
      const text = await ask((id) => {
        bridge.inkRecognise(id, JSON.stringify(strokes));
      });
      return typeof text === 'string' ? text : '';
    },
  };
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

/** How long to wait for a web site before giving up, in ms. */
const WEB_TIMEOUT_MS = 20_000;

/** A web address's text, with plain messages for the ways it can fail. */
export async function fetchWebText(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(WEB_TIMEOUT_MS),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new Error('The site could not be reached. Check the internet connection.');
  }
  if (!response.ok) {
    throw new Error(
      `The site answered with an error (${String(response.status)}). Try again later.`,
    );
  }
  return response.text();
}

/** The window's own buttons, as the system title bar is hidden on the computer. */
function desktopFrame(): WindowFrame {
  const win = () => getCurrentWindow();
  return {
    minimise: () => win().minimize(),
    toggleMaximise: () => win().toggleMaximize(),
    close: () => win().close(),
    isMaximised: () => win().isMaximized(),
    startDragging: () => win().startDragging(),
    onResized: (listener) => {
      let stop: (() => void) | null = null;
      let stopped = false;
      void win()
        .onResized(() => {
          listener();
        })
        .then((unlisten) => {
          if (stopped) unlisten();
          else stop = unlisten;
        });
      return () => {
        stopped = true;
        stop?.();
      };
    },
  };
}

export class TauriAdapter implements PlatformAdapter {
  async openFeedbackEmail(subject: string, body: string): Promise<void> {
    const bridge = window.BenchWorkAndroid;
    if (bridge) {
      const result = JSON.parse(bridge.openFeedbackEmail(subject, body)) as { error?: string };
      if (result.error) throw new Error(result.error);
    } else await call<undefined>('open_feedback_email', () => ({ subject, body }));
  }
  readonly nativeSync: NativeSyncAdapter = {
    localAddress: () => call<string>('native_sync_ip'),
    start: (ip, otherSyncStopped) =>
      call<SyncHostStatus>('native_sync_start', () => ({ ip, otherSyncStopped })),
    stop: async () => {
      await call('native_sync_stop');
    },
    status: () => call<SyncHostStatus>('native_sync_status'),
    invitation: () => call<SyncPairing>('native_sync_invitation'),
    exportInvitation: (text) => call<string>('native_sync_export_invitation', () => ({ text })),
    readInvitation: (source) => {
      if (source.startsWith('content:') && window.BenchWorkAndroid) {
        const result = JSON.parse(window.BenchWorkAndroid.readSyncPairing(source)) as {
          invitation?: SyncInvitation;
          error?: string;
        };
        if (result.error || !result.invitation)
          return Promise.reject(new Error(result.error ?? 'Invalid pairing file'));
        return Promise.resolve(result.invitation);
      }
      return call<SyncInvitation>('native_sync_read_invitation', () => ({ source }));
    },
    join: (invitation, name) =>
      call<SyncConnection>('native_sync_join', () => ({ invitation, name })),
    sync: (connection, otherSyncStopped) =>
      call<SyncReport>('native_sync_run', () => ({ connection, otherSyncStopped })),
    revoke: async () => {
      await call('native_sync_revoke');
    },
  };
  readonly materials: MaterialFiles = {
    importFile: (source, folder) =>
      call<string>('import_material_file', () => ({ source, folder: normaliseVaultPath(folder) })),
    importPowerPoint: (source, folder) =>
      call<ImportedSlides>('import_powerpoint', () => ({
        source,
        folder: normaliseVaultPath(folder),
      })),
  };
  readonly audience: AudienceDisplay | null =
    detectKind() === 'desktop'
      ? {
          monitors: () => call<DisplayInfo[]>('audience_monitors'),
          open: (frame, monitor) => call<undefined>('open_audience', () => ({ frame, monitor })),
          update: (frame) => call<undefined>('update_audience', () => ({ frame })),
          close: () => call<undefined>('close_audience'),
        }
      : null;
  readonly fileTransfers: FileTransfers | null =
    detectKind() === 'desktop'
      ? {
          pickFolder: () =>
            this.pickFolder({ title: 'Choose a folder managed by your cloud sync app' }),
          openFolder: (folder) => call<undefined>('open_storage_folder', () => ({ folder })),
          openFile: (copy) => call<undefined>('open_storage_file', () => ({ copy })),
          copy: (id, source, folder) =>
            call<VerifiedCopy>('copy_to_storage', () => ({ id, source, folder })),
          cancel: (id) => call<undefined>('stop_program', () => ({ id })),
          verify: (copy) => call<undefined>('verify_storage_copy', () => ({ copy })),
          reveal: (copy) => call<undefined>('reveal_storage_copy', () => ({ copy })),
          recycleSource: (copy) => call<undefined>('recycle_storage_source', () => ({ copy })),
        }
      : null;
  readonly kind: DeviceKind = detectKind();
  readonly windowFrame: WindowFrame | null = detectKind() === 'desktop' ? desktopFrame() : null;
  readonly openInSystem: ((path: string) => Promise<void>) | null =
    detectKind() === 'desktop'
      ? (path) => call<undefined>('open_vault_file', () => ({ path: normaliseVaultPath(path) }))
      : null;
  readonly folderBrowser: FolderBrowser | null = androidFolderBrowser();
  readonly openFolderInSystem =
    detectKind() === 'desktop'
      ? (path: string) =>
          call<undefined>('open_vault_folder', () => ({ path: normaliseVaultPath(path) }))
      : null;
  readonly handwriting: HandwritingRecognizer | null = androidHandwriting();
  readonly programs: ProgramRunner | null =
    detectKind() === 'desktop'
      ? {
          snapshotFile: (source: string, destination: string) =>
            call<string>('snapshot_program_file', () => ({
              source,
              destination: normaliseVaultPath(destination),
            })),
          run: (r) =>
            call<ProgramResult>('run_program', () => ({
              id: r.id,
              program: r.program,
              args: r.args,
              cwd: normaliseVaultPath(r.cwd),
            })),
          stop: (id) => call<undefined>('stop_program', () => ({ id })),
        }
      : null;

  // Backup folders are picked with the system's folder picker, so not on Android.
  readonly backups: VaultBackups | null =
    detectKind() === 'desktop'
      ? {
          backUp: (folder, name, stamp, keep) =>
            call<BackupFile>('backup_vault', () => ({ folder, name, stamp, keep })),
          list: (folder, name) => call<BackupFile[]>('list_backups', () => ({ folder, name })),
          restore: (path) => call<string>('restore_backup', () => ({ path })),
        }
      : null;

  setStylusHandwriting(on: boolean): void {
    window.BenchWorkAndroid?.setHandwriting(on);
  }

  microsoftRequest(request: HttpRequest): Promise<HttpResponse> {
    return call('microsoft_request', () => ({ request }));
  }
  async secureRead(key: string): Promise<string | null> {
    const bridge = window.BenchWorkAndroid;
    if (!bridge) return call('secure_read', () => ({ key }));
    const result = JSON.parse(bridge.secureRead(key)) as { value?: string; error?: string };
    if (result.error) throw new Error(result.error);
    return result.value ?? null;
  }
  async secureWrite(key: string, value: string | null): Promise<void> {
    const bridge = window.BenchWorkAndroid;
    if (!bridge) return call('secure_write', () => ({ key, value }));
    const result = JSON.parse(bridge.secureWrite(key, value ?? '', value === null)) as {
      error?: string;
    };
    if (result.error) throw new Error(result.error);
  }

  fetchText(url: string): Promise<string> {
    return fetchWebText(url);
  }

  async openWebLink(url: string): Promise<void> {
    const bridge = window.BenchWorkAndroid;
    if (bridge) bridge.openLink(url);
    else await call<undefined>('open_web_link', () => ({ url }));
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

  onExitRequested(handler: () => Promise<boolean>): () => void {
    const win = getCurrentWindow();
    let stopped = false;
    let unlisten: (() => void) | null = null;
    void win
      .onCloseRequested(async (event) => {
        // Hold the window open until the work is saved, then close it.
        event.preventDefault();
        try {
          if (await handler()) await win.destroy();
        } catch (err) {
          console.error('Could not close the app safely', err);
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
