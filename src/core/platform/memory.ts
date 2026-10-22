import { PlatformError } from './errors';
import type { DeviceKind, DirEntry, PlatformAdapter } from './types';
import { baseName, normaliseVaultPath, parentVaultPath } from './vaultPath';

type MemoryNode =
  { kind: 'dir'; modified: number } | { kind: 'file'; text: string; modified: number };

/** Folder contents for seeding: vault-relative path to file text, or null for a folder. */
export type MemoryFolderContents = Record<string, string | null>;

export interface MemoryAdapterOptions {
  kind?: DeviceKind;
  folders?: Record<string, MemoryFolderContents>;
  appSettings?: unknown;
}

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
    const nodes = this.folders.get(root ?? this.root ?? '');
    if (!nodes) throw new PlatformError('NotFound', `No folder '${root ?? ''}'`);
    const out: MemoryFolderContents = {};
    for (const path of [...nodes.keys()].sort()) {
      if (path === '') continue;
      const node = nodes.get(path);
      out[path] = node?.kind === 'file' ? node.text : null;
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

  setVaultRoot(root: string): Promise<string> {
    return this.run(() => {
      if (!this.folders.has(root)) throw new PlatformError('NotFound', `No folder '${root}'`);
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

  private vault(): Map<string, MemoryNode> {
    const nodes = this.root === null ? undefined : this.folders.get(this.root);
    if (!nodes) throw new PlatformError('NoVault', 'No vault is open');
    return nodes;
  }

  private expectDir(nodes: Map<string, MemoryNode>, path: string): void {
    const node = nodes.get(path);
    if (!node) throw new PlatformError('NotFound', `'${path}' does not exist`);
    if (node.kind !== 'dir') throw new PlatformError('NotADirectory', `'${path}' is not a folder`);
  }

  private makeDirs(nodes: Map<string, MemoryNode>, path: string): void {
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
