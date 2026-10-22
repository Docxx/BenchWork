import { PlatformError } from './errors';
import type { DeviceKind, DirEntry, PlatformAdapter, VaultOwner } from './types';
import { baseName, normaliseVaultPath, parentVaultPath } from './vaultPath';

type MemoryNode =
  { kind: 'dir'; modified: number } | { kind: 'file'; text: string; modified: number };

/** The parts of a Map the adapter uses, so a subfolder can stand in for a whole folder. */
interface NodeStore extends Iterable<[string, MemoryNode]> {
  get(path: string): MemoryNode | undefined;
  set(path: string, node: MemoryNode): void;
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

/**
 * An in-memory PlatformAdapter for unit tests and Playwright runs in a plain
 * browser. It follows the same rules and error kinds as the Rust backend.
 */
export class MemoryAdapter implements PlatformAdapter {
  readonly kind: DeviceKind;
  private readonly folders = new Map<string, Map<string, MemoryNode>>();
  private readonly pickQueue: (string | null)[] = [];
  private root: string | null = null;
  private appSettings: unknown;
  private clock = 1_700_000_000_000;

  constructor(options: MemoryAdapterOptions = {}) {
    this.kind = options.kind ?? 'desktop';
    this.appSettings = options.appSettings ?? null;
    for (const [root, contents] of Object.entries(options.folders ?? {})) {
      this.addFolder(root, contents);
    }
  }

  // ---- Test helpers ----

  /** Creates a folder on the fake disk, with optional contents. */
  addFolder(root: string, contents: MemoryFolderContents = {}): void {
    const nodes = new Map<string, MemoryNode>([['', { kind: 'dir', modified: this.tick() }]]);
    this.folders.set(root, nodes);
    for (const [rawPath, text] of Object.entries(contents)) {
      const path = normaliseVaultPath(rawPath);
      this.makeDirs(nodes, parentVaultPath(path) ?? '');
      if (text === null) this.makeDirs(nodes, path);
      else nodes.set(path, { kind: 'file', text, modified: this.tick() });
    }
  }

  /** Sets what the next pickFolder calls return; null means the user cancelled. */
  queuePick(...results: (string | null)[]): void {
    this.pickQueue.push(...results);
  }

  /** Every file and folder in a folder (the open vault by default), sorted by path. */
  snapshot(root?: string): MemoryFolderContents {
    const nodes = this.store(root ?? this.root ?? '');
    const out: MemoryFolderContents = {};
    for (const [path, node] of [...nodes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (path === '') continue;
      out[path] = node.kind === 'file' ? node.text : null;
    }
    return out;
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
          size: node.kind === 'file' ? new TextEncoder().encode(node.text).length : 0,
          modified: node.modified,
        });
      }
      // Byte order, like the Rust backend.
      return entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    });
  }

  readText(path: string): Promise<string> {
    return this.run(() => {
      const nodes = this.vault();
      const file = normaliseVaultPath(path);
      const node = nodes.get(file);
      if (!node) throw new PlatformError('NotFound', `'${file}' does not exist`);
      if (node.kind !== 'file') throw new PlatformError('NotAFile', `'${file}' is a folder`);
      return node.text;
    });
  }

  writeTextAtomic(path: string, text: string): Promise<void> {
    return this.run(() => {
      const nodes = this.vault();
      const file = normaliseVaultPath(path);
      if (file === '') throw new PlatformError('NotAFile', 'The vault root is a folder');
      const parent = parentVaultPath(file) ?? '';
      const parentNode = nodes.get(parent);
      if (!parentNode) throw new PlatformError('NotFound', 'Parent folder does not exist');
      if (parentNode.kind !== 'dir') {
        throw new PlatformError('NotADirectory', 'The parent of this path is a file');
      }
      if (nodes.get(file)?.kind === 'dir') {
        throw new PlatformError('NotAFile', 'Cannot write over a folder');
      }
      nodes.set(file, { kind: 'file', text, modified: this.tick() });
    });
  }

  ensureDir(path: string): Promise<void> {
    return this.run(() => {
      this.makeDirs(this.vault(), normaliseVaultPath(path));
    });
  }

  exists(path: string): Promise<boolean> {
    return this.run(() => this.vault().has(normaliseVaultPath(path)));
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

  private makeDirs(nodes: NodeStore, path: string): void {
    let current = '';
    for (const part of path === '' ? [] : path.split('/')) {
      current = current === '' ? part : `${current}/${part}`;
      const node = nodes.get(current);
      if (node?.kind === 'file') {
        throw new PlatformError('NotADirectory', `'${current}' is a file`);
      }
      if (!node) nodes.set(current, { kind: 'dir', modified: this.tick() });
    }
  }

  private tick(): number {
    this.clock += 1000;
    return this.clock;
  }
}
