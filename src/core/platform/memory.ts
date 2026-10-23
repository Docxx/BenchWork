import { PlatformError } from './errors';
import { MemoryIndex } from './memoryIndex';
import type {
  DeviceKind,
  DirEntry,
  FileInfo,
  PlatformAdapter,
  VaultChange,
  VaultOwner,
} from './types';
import { baseName, normaliseVaultPath, parentVaultPath } from './vaultPath';

type MemoryNode =
  { kind: 'dir'; modified: number } | { kind: 'file'; bytes: Uint8Array; modified: number };

/** The parts of a Map the adapter uses, so a subfolder can stand in for a whole folder. */
interface NodeStore extends Iterable<[string, MemoryNode]> {
  get(path: string): MemoryNode | undefined;
  set(path: string, node: MemoryNode): void;
  delete(path: string): void;
  has(path: string): boolean;
}

/** A view of `nodes` with `prefix` as its root, for a vault opened on a subfolder. */
function prefixedNodes(nodes: Map<string, MemoryNode>, prefix: string): NodeStore {
  const full = (path: string) => (path === '' ? prefix : `${prefix}/${path}`);
  return {
    get: (path) => nodes.get(full(path)),
    set: (path, node) => {
      nodes.set(full(path), node);
    },
    delete: (path) => {
      nodes.delete(full(path));
    },
    has: (path) => nodes.has(full(path)),
    *[Symbol.iterator]() {
      for (const [path, node] of nodes) {
        if (path === prefix) yield ['', node];
        else if (path.startsWith(`${prefix}/`)) yield [path.slice(prefix.length + 1), node];
      }
    },
  };
}

/** Folder contents for seeding: vault-relative path to file text, or null for a folder. */
export type MemoryFolderContents = Record<string, string | null>;

export interface MemoryAdapterOptions {
  kind?: DeviceKind;
  folders?: Record<string, MemoryFolderContents>;
  appSettings?: unknown;
}

// Mirrors VAULT_DIR in src-tauri/src/vault_root.rs. The platform layer sits
// below src/core/vault, so it keeps its own copy rather than importing it.
const VAULT_DIR_NAME = '.benchwork';

/** Folder returned by pickFolder when no result has been queued. */
export const DEFAULT_MEMORY_FOLDER = 'memory://Vault';

const encoder = new TextEncoder();
const strictDecoder = new TextDecoder('utf-8', { fatal: true });

const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

/** Same rule as `ignored` in src-tauri/src/watcher.rs. */
function ignoredChange(path: string): boolean {
  if (path === '.benchwork') return true;
  if (path.startsWith('.benchwork/') && path !== '.benchwork/config.json') return true;
  const name = baseName(path);
  return name.startsWith('.') && name.endsWith('.tmp');
}

function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * An in-memory PlatformAdapter for unit tests and Playwright runs in a plain
 * browser. It follows the same rules and error kinds as the Rust backend,
 * and reports its own changes to watchers like the real file watcher does.
 */
export class MemoryAdapter implements PlatformAdapter {
  readonly kind: DeviceKind;
  private readonly folders = new Map<string, Map<string, MemoryNode>>();
  private readonly external = new Map<string, { bytes: Uint8Array; modified: number }>();
  private readonly pickQueue: (string | null)[] = [];
  private readonly filePickQueue: string[][] = [];
  private readonly trashBin: string[] = [];
  private readonly listeners = new Set<(change: VaultChange) => void>();
  private readonly exitHandlers = new Set<() => Promise<void>>();
  private pendingChanges = new Set<string>();
  private root: string | null = null;
  private appSettings: unknown;
  private clock = 1_700_000_000_000;
  readonly index = new MemoryIndex(() => this.root);

  constructor(options: MemoryAdapterOptions = {}) {
    this.kind = options.kind ?? 'desktop';
    this.appSettings = options.appSettings ?? null;
    for (const [root, contents] of Object.entries(options.folders ?? {})) {
      this.addFolder(root, contents);
    }
  }

  // ---- Test helpers ----

  /** Creates a folder on the fake disk, with optional contents. Replaces one already there. */
  addFolder(root: string, contents: MemoryFolderContents = {}): void {
    const nodes = new Map<string, MemoryNode>([['', { kind: 'dir', modified: this.tick() }]]);
    this.folders.set(root, nodes);
    for (const [rawPath, text] of Object.entries(contents)) {
      const path = normaliseVaultPath(rawPath);
      this.makeDirs(nodes, parentVaultPath(path) ?? '');
      if (text === null) this.makeDirs(nodes, path);
      else nodes.set(path, { kind: 'file', bytes: encoder.encode(text), modified: this.tick() });
    }
  }

  /** A file outside any vault, for copyIn (dragged-in files). */
  addExternalFile(fullPath: string, content: string | Uint8Array): void {
    const bytes = typeof content === 'string' ? encoder.encode(content) : content;
    this.external.set(fullPath, { bytes, modified: this.tick() });
  }

  /** Sets what the next pickFiles calls return; an empty list means the user cancelled. */
  queueFilePick(...results: string[][]): void {
    this.filePickQueue.push(...results);
  }

  /** Sets what the next pickFolder calls return; null means the user cancelled. */
  queuePick(...results: (string | null)[]): void {
    this.pickQueue.push(...results);
  }

  /** Vault-relative paths sent to the Recycle Bin, oldest first. */
  trashed(): string[] {
    return [...this.trashBin];
  }

  /** Acts as if the user closed the app: runs and waits for the exit handlers. */
  async requestExit(): Promise<void> {
    for (const handler of [...this.exitHandlers]) await handler();
  }

  /** Changes a file as another program would, so watchers hear about it. */
  externalWrite(path: string, text: string): Promise<void> {
    return this.writeTextAtomic(path, text);
  }

  /** Every file and folder in a folder (the open vault by default), sorted by path. */
  snapshot(root?: string): MemoryFolderContents {
    const nodes = this.store(root ?? this.root ?? '');
    const out: MemoryFolderContents = {};
    for (const [path, node] of [...nodes].sort(([a], [b]) => byName(a, b))) {
      if (path === '') continue;
      out[path] = node.kind === 'file' ? this.describe(node.bytes) : null;
    }
    return out;
  }

  /** The raw bytes of a file in the open vault. */
  bytesOf(path: string): Uint8Array | null {
    const node = this.vault().get(normaliseVaultPath(path));
    return node?.kind === 'file' ? node.bytes : null;
  }

  // ---- PlatformAdapter ----

  pickFolder(): Promise<string | null> {
    return this.run(() => {
      const next = this.pickQueue.length > 0 ? this.pickQueue.shift() : DEFAULT_MEMORY_FOLDER;
      if (next === DEFAULT_MEMORY_FOLDER && !this.folders.has(next)) this.addFolder(next);
      return next ?? null;
    });
  }

  /**
   * Like the Rust version, but only within one fake folder: `path` is a
   * folder added with addFolder, or a `/`-separated path inside one.
   */
  findVaultRoot(path: string): Promise<VaultOwner | null> {
    return this.run(() => {
      const { base, nodes, prefix } = this.locate(path);
      let throughBenchwork = false;
      for (let rel: string | null = prefix; rel !== null; rel = parentVaultPath(rel)) {
        if (baseName(rel).toLowerCase() === VAULT_DIR_NAME) {
          throughBenchwork = true;
          continue;
        }
        const marker = rel === '' ? VAULT_DIR_NAME : `${rel}/${VAULT_DIR_NAME}`;
        if (nodes.get(marker)?.kind !== 'dir') continue;
        const via = throughBenchwork ? 'benchwork' : rel === prefix ? 'selfVault' : 'ancestor';
        return { root: rel === '' ? base : `${base}/${rel}`, folder: path, via };
      }
      return null;
    });
  }

  /** Opens a fake folder, or any folder inside one, as the vault. */
  setVaultRoot(root: string): Promise<string> {
    return this.run(() => {
      this.locate(root);
      this.root = root;
      this.pendingChanges = new Set();
      return root;
    });
  }

  listDir(path: string): Promise<DirEntry[]> {
    return this.run(() => {
      const nodes = this.vault();
      const dir = normaliseVaultPath(path);
      this.expectDir(nodes, dir);
      const entries: DirEntry[] = [];
      for (const [childPath, node] of nodes) {
        if (childPath === '' || parentVaultPath(childPath) !== dir) continue;
        entries.push({
          name: baseName(childPath),
          path: childPath,
          isDir: node.kind === 'dir',
          size: node.kind === 'file' ? node.bytes.length : 0,
          modified: node.modified,
        });
      }
      // Byte order, like the Rust backend.
      return entries.sort((a, b) => byName(a.name, b.name));
    });
  }

  readText(path: string): Promise<string> {
    return this.run(() => {
      const file = normaliseVaultPath(path);
      const node = this.vault().get(file);
      if (!node) throw new PlatformError('NotFound', `'${file}' does not exist`);
      if (node.kind !== 'file') throw new PlatformError('NotAFile', `'${file}' is a folder`);
      try {
        return strictDecoder.decode(node.bytes);
      } catch {
        throw new PlatformError('Io', `'${file}' is not a text file`);
      }
    });
  }

  writeTextAtomic(path: string, text: string): Promise<void> {
    return this.writeBytes(path, encoder.encode(text));
  }

  writeBytes(path: string, data: Uint8Array): Promise<void> {
    return this.run(() => {
      const nodes = this.vault();
      const file = normaliseVaultPath(path);
      if (file === '') throw new PlatformError('NotAFile', 'The vault root is a folder');
      this.expectParentDir(nodes, file);
      if (nodes.get(file)?.kind === 'dir') {
        throw new PlatformError('NotAFile', 'Cannot write over a folder');
      }
      nodes.set(file, { kind: 'file', bytes: data.slice(), modified: this.tick() });
      this.changed(file);
    });
  }

  ensureDir(path: string): Promise<void> {
    return this.run(() => {
      this.makeDirs(this.vault(), normaliseVaultPath(path), true);
    });
  }

  exists(path: string): Promise<boolean> {
    return this.run(() => this.vault().has(normaliseVaultPath(path)));
  }

  createNew(path: string, text: string): Promise<void> {
    return this.run(() => {
      const nodes = this.vault();
      const file = normaliseVaultPath(path);
      if (file === '' || nodes.has(file)) {
        throw new PlatformError('AlreadyExists', `'${file}' already exists`);
      }
      this.expectParentDir(nodes, file);
      nodes.set(file, { kind: 'file', bytes: encoder.encode(text), modified: this.tick() });
      this.changed(file);
    });
  }

  rename(from: string, to: string): Promise<void> {
    return this.run(() => {
      const nodes = this.vault();
      const src = normaliseVaultPath(from);
      const dest = normaliseVaultPath(to);
      if (src === '' || dest === '') {
        throw new PlatformError('InvalidPath', 'The vault itself cannot be renamed');
      }
      if (dest.startsWith(`${src}/`)) {
        throw new PlatformError('InvalidPath', 'A folder cannot be moved inside itself');
      }
      if (!nodes.has(src)) throw new PlatformError('NotFound', `'${src}' does not exist`);
      if (src === dest) return;
      this.expectParentDir(nodes, dest);
      if (nodes.has(dest)) throw new PlatformError('AlreadyExists', `'${dest}' already exists`);

      const moving = [...nodes].filter(([p]) => p === src || p.startsWith(`${src}/`));
      for (const [p] of moving) nodes.delete(p);
      for (const [p, node] of moving) {
        const moved = dest + p.slice(src.length);
        nodes.set(moved, node);
        this.changed(p);
        this.changed(moved);
      }
    });
  }

  copyIn(externalPath: string, to: string, maxBytes: number): Promise<number> {
    return this.run(() => {
      const data = this.externalFile(externalPath).bytes;
      if (data.length > maxBytes) {
        throw new PlatformError(
          'TooLarge',
          `The file is ${String(data.length)} bytes, over the limit of ${String(maxBytes)}`,
        );
      }
      const nodes = this.vault();
      const dest = normaliseVaultPath(to);
      this.expectParentDir(nodes, dest);
      if (nodes.has(dest)) throw new PlatformError('AlreadyExists', `'${dest}' already exists`);
      nodes.set(dest, { kind: 'file', bytes: data.slice(), modified: this.tick() });
      this.changed(dest);
      return data.length;
    });
  }

  pickFiles(): Promise<string[]> {
    return this.run(() => this.filePickQueue.shift() ?? []);
  }

  readBytes(path: string, maxBytes: number): Promise<Uint8Array> {
    return this.run(() => {
      const { bytes } = this.fileAt(path, false);
      if (bytes.length > maxBytes) {
        throw new PlatformError(
          'TooLarge',
          `The file is ${String(bytes.length)} bytes, over the limit of ${String(maxBytes)}`,
        );
      }
      return bytes.slice();
    });
  }

  fileInfo(path: string, external = false): Promise<FileInfo> {
    return this.run(() => {
      const file = this.fileAt(path, external);
      return { size: file.bytes.length, modified: file.modified };
    });
  }

  async hashFile(path: string, external = false): Promise<string> {
    const { bytes } = await this.run(() => this.fileAt(path, external));
    const digest = await crypto.subtle.digest('SHA-256', bytes.slice());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** Same rules as `remove_snapshot` in src-tauri/src/vault_fs.rs. */
  removeSnapshot(path: string): Promise<void> {
    return this.run(() => {
      const nodes = this.vault();
      const file = normaliseVaultPath(path);
      if (!file.startsWith('.benchwork/snapshots/')) {
        throw new PlatformError('InvalidPath', `'${file}' is not a snapshot`);
      }
      const node = nodes.get(file);
      if (!node) throw new PlatformError('NotFound', `'${file}' does not exist`);
      if (node.kind !== 'file') throw new PlatformError('NotAFile', `'${file}' is not a file`);
      nodes.delete(file);
      this.changed(file);
    });
  }

  trash(path: string): Promise<void> {
    return this.run(() => {
      const nodes = this.vault();
      const target = normaliseVaultPath(path);
      if (target === '') {
        throw new PlatformError(
          'InvalidPath',
          'The vault itself cannot be moved to the Recycle Bin',
        );
      }
      if (!nodes.has(target)) throw new PlatformError('NotFound', `'${target}' does not exist`);
      for (const [p] of [...nodes]) {
        if (p === target || p.startsWith(`${target}/`)) {
          nodes.delete(p);
          this.changed(p);
        }
      }
      this.trashBin.push(target);
    });
  }

  watch(listener: (change: VaultChange) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  assetUrl(path: string): string | null {
    const node = this.root === null ? undefined : this.vault().get(normaliseVaultPath(path));
    if (node?.kind !== 'file' || typeof URL.createObjectURL !== 'function') return null;
    const ext = baseName(path).split('.').pop()?.toLowerCase() ?? '';
    const type = MIME_TYPES[ext] ?? 'application/octet-stream';
    return URL.createObjectURL(new Blob([node.bytes.slice()], { type }));
  }

  onExitRequested(handler: () => Promise<void>): () => void {
    this.exitHandlers.add(handler);
    return () => {
      this.exitHandlers.delete(handler);
    };
  }

  loadAppSettings(): Promise<unknown> {
    return this.run(() => structuredClone(this.appSettings));
  }

  saveAppSettings(settings: unknown): Promise<void> {
    return this.run(() => {
      this.appSettings = structuredClone(settings);
    });
  }

  // ---- Internals ----

  /** Runs synchronous work as a promise, turning throws into rejections. */
  private run<T>(work: () => T): Promise<T> {
    try {
      return Promise.resolve(work());
    } catch (err) {
      return Promise.reject(PlatformError.from(err));
    }
  }

  /**
   * Queues a change for watchers. Changes made in the same turn are sent
   * together, a little later, like the real watcher's debouncing.
   */
  private changed(path: string): void {
    if (ignoredChange(path)) return;
    const first = this.pendingChanges.size === 0;
    this.pendingChanges.add(path);
    if (!first) return;
    const batch = this.pendingChanges;
    setTimeout(() => {
      if (batch !== this.pendingChanges || batch.size === 0) return;
      this.pendingChanges = new Set();
      const change = { paths: [...batch].sort(byName) };
      for (const listener of this.listeners) listener(change);
    }, 0);
  }

  /** A vault file, or with `external`, a full path: an external file or one in any fake folder. */
  private fileAt(path: string, external: boolean): { bytes: Uint8Array; modified: number } {
    if (external) return this.externalFile(path);
    const file = normaliseVaultPath(path);
    const node = this.vault().get(file);
    if (!node) throw new PlatformError('NotFound', `'${file}' does not exist`);
    if (node.kind !== 'file') throw new PlatformError('NotAFile', `'${file}' is a folder`);
    return node;
  }

  private externalFile(fullPath: string): { bytes: Uint8Array; modified: number } {
    const outside = this.external.get(fullPath);
    if (outside) return outside;
    const base = [...this.folders.keys()]
      .sort((a, b) => b.length - a.length)
      .find((r) => fullPath.startsWith(`${r}/`));
    const node =
      base === undefined ? undefined : this.folders.get(base)?.get(fullPath.slice(base.length + 1));
    if (node?.kind === 'file') return node;
    if (node) throw new PlatformError('NotAFile', `'${fullPath}' is a folder`);
    throw new PlatformError('NotFound', `No file '${fullPath}'`);
  }

  private describe(bytes: Uint8Array): string {
    try {
      return strictDecoder.decode(bytes);
    } catch {
      return `[binary ${String(bytes.length)} bytes]`;
    }
  }

  /** The open vault's files, looked up afresh so addFolder replacements show. */
  private vault(): NodeStore {
    if (this.root === null) throw new PlatformError('NoVault', 'No vault is open');
    return this.store(this.root);
  }

  private store(path: string): NodeStore {
    const { nodes, prefix } = this.locate(path);
    return prefix === '' ? nodes : prefixedNodes(nodes, prefix);
  }

  /**
   * Finds which fake folder `path` is in (the longest match) and the
   * folder-relative path inside it, which must be an existing folder.
   */
  private locate(path: string): { base: string; nodes: Map<string, MemoryNode>; prefix: string } {
    const base = [...this.folders.keys()]
      .sort((a, b) => b.length - a.length)
      .find((r) => path === r || path.startsWith(`${r}/`));
    const nodes = base === undefined ? undefined : this.folders.get(base);
    if (base === undefined || !nodes) throw new PlatformError('NotFound', `No folder '${path}'`);
    const prefix = normaliseVaultPath(path === base ? '' : path.slice(base.length + 1));
    if (nodes.get(prefix)?.kind !== 'dir') {
      throw new PlatformError('NotFound', `No folder '${path}'`);
    }
    return { base, nodes, prefix };
  }

  private expectDir(nodes: NodeStore, path: string): void {
    const node = nodes.get(path);
    if (!node) throw new PlatformError('NotFound', `'${path}' does not exist`);
    if (node.kind !== 'dir') throw new PlatformError('NotADirectory', `'${path}' is not a folder`);
  }

  private expectParentDir(nodes: NodeStore, path: string): void {
    const parent = nodes.get(parentVaultPath(path) ?? '');
    if (!parent) throw new PlatformError('NotFound', 'Parent folder does not exist');
    if (parent.kind !== 'dir') {
      throw new PlatformError('NotADirectory', 'The parent of this path is a file');
    }
  }

  private makeDirs(nodes: NodeStore, path: string, notify = false): void {
    let current = '';
    for (const part of path === '' ? [] : path.split('/')) {
      current = current === '' ? part : `${current}/${part}`;
      const node = nodes.get(current);
      if (node?.kind === 'file') {
        throw new PlatformError('NotADirectory', `'${current}' is a file`);
      }
      if (!node) {
        nodes.set(current, { kind: 'dir', modified: this.tick() });
        if (notify) this.changed(current);
      }
    }
  }

  private tick(): number {
    this.clock += 1000;
    return this.clock;
  }
}
