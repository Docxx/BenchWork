/**
 * Everything the core needs from the operating system. Each platform (Tauri
 * desktop, Android, later Apple, and the in-memory adapter for tests) supplies
 * one of these, so platform code never leaks into shared UI.
 *
 * All vault paths are relative to the open vault, use `/` separators, and
 * `""` means the vault root. See `vaultPath.ts` for the rules.
 */
export interface PlatformAdapter {
  readonly kind: DeviceKind;

  /** Shows a folder picker. Resolves to the chosen folder, or null if cancelled. */
  pickFolder(options: { title: string }): Promise<string | null>;

  /**
   * The vault a folder belongs to: the nearest folder at or above it that has
   * a `.benchwork` folder, skipping `.benchwork` folders themselves. Null if
   * it is not inside a vault.
   */
  findVaultRoot(path: string): Promise<VaultOwner | null>;

  /** Opens a folder as the vault. Resolves to its full path for display. */
  setVaultRoot(root: string): Promise<string>;

  listDir(path: string): Promise<DirEntry[]>;
  readText(path: string): Promise<string>;
  /** Writes via a temporary file and rename. The parent folder must exist. */
  writeTextAtomic(path: string, text: string): Promise<void>;
  /** Creates the folder and any missing parents. */
  ensureDir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;

  /** Creates a file, failing with AlreadyExists rather than overwriting one. */
  createNew(path: string, text: string): Promise<void>;
  /**
   * Renames or moves a file or folder. Fails with AlreadyExists if `to` is
   * taken (a change of case alone is allowed where names ignore case).
   */
  rename(from: string, to: string): Promise<void>;
  /** Writes binary data, such as a pasted image, safely like writeTextAtomic. */
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  /**
   * Copies a file from outside the vault (a full path, from a drop) to `to`.
   * Fails with TooLarge over `maxBytes`, AlreadyExists if `to` is taken.
   * Resolves to the number of bytes copied.
   */
  copyIn(externalPath: string, to: string, maxBytes: number): Promise<number>;
  /** Shows a file picker. Resolves to the full paths chosen; empty if cancelled. */
  pickFiles(options: { title: string; multiple: boolean }): Promise<string[]>;
  /** Reads a vault file as bytes, for previews. Fails with TooLarge over `maxBytes`. */
  readBytes(path: string, maxBytes: number): Promise<Uint8Array>;
  /**
   * Size and modified time of a vault file, or with `external` true, of a
   * full path outside the vault (a linked file).
   */
  fileInfo(path: string, external?: boolean): Promise<FileInfo>;
  /** The file's SHA-256 as lower-case hex. `external` as for fileInfo. */
  hashFile(path: string, external?: boolean): Promise<string>;
  /** Moves a file or folder to the Recycle Bin. Nothing deletes permanently. */
  trash(path: string): Promise<void>;
  /**
   * Deletes one of BenchWork's own snapshot files, to keep only recent ones.
   * Refuses anything that is not a file in `.benchwork/snapshots/`.
   */
  removeSnapshot(path: string): Promise<void>;
  /**
   * Calls `listener` with paths that changed in the open vault, from any
   * source, BenchWork included. Returns a function that stops listening.
   */
  watch(listener: (change: VaultChange) => void): () => void;
  /** A URL an <img> can load a vault file from, or null if there is none. */
  assetUrl(path: string): string | null;
  /**
   * Runs `handler` when the user closes the app, and waits for it before
   * closing, so unsaved work can be saved. Returns a function that stops it.
   */
  onExitRequested(handler: () => Promise<void>): () => void;

  /** Per-device settings, stored outside the vault. Null if never saved. */
  loadAppSettings(): Promise<unknown>;
  saveAppSettings(settings: unknown): Promise<void>;

  /** The open vault's search index, in `.benchwork/index.sqlite`. */
  readonly index: SearchIndex;

  /** Pandoc's version, or null if it is not installed (always null on tablets). */
  pandocVersion(): Promise<string | null>;
  /** Converts Markdown to Word with Pandoc. Every path is a vault path. */
  pandocToWord(options: PandocWordOptions): Promise<void>;
}

/**
 * Stores what was read from pages and searches it. Disposable: it can be
 * cleared and rebuilt from the vault at any time.
 */
export interface SearchIndex {
  /** Opens the open vault's index, creating it if needed. */
  open(): Promise<{ fresh: boolean }>;
  close(): Promise<void>;
  /** Every page held, with the size and time it had when read. */
  entries(): Promise<IndexEntry[]>;
  /** Removes `removes` (files, or folders and all in them), then adds or replaces `upserts`. */
  apply(upserts: readonly IndexedPage[], removes: readonly string[]): Promise<void>;
  clear(): Promise<void>;
  /** Pages matching what someone typed, best first. */
  search(query: string, limit: number): Promise<SearchHit[]>;
  /** Links whose key is one of `keys` (see linkKey), with the page each is in. */
  backlinks(keys: readonly string[]): Promise<LinkRef[]>;
  /** Every page, sorted by path. */
  pages(): Promise<PageRef[]>;
  /** Every tag with how many pages have it; case is ignored. */
  tags(): Promise<TagCount[]>;
  /** Pages with `tag` or a tag nested under it, ignoring case, by title. */
  tagged(tag: string, limit: number): Promise<SearchHit[]>;
}

export interface LinkRef {
  /** The page the link is in. */
  source: string;
  /** As written. */
  target: string;
}

export interface PageRef {
  path: string;
  title: string;
  id: string | null;
  /** The page's `type`, or a record's kind, such as `dataset`. */
  type: string;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface IndexEntry {
  path: string;
  mtime: number | null;
  size: number;
}

export interface IndexedLink {
  /** As written in the page. */
  target: string;
  /** Lower case, without `.md` or `#heading`, for matching. */
  key: string;
  embed: boolean;
}

export interface IndexedPage {
  path: string;
  id: string | null;
  title: string;
  type: string;
  created: string | null;
  modified: string | null;
  mtime: number | null;
  size: number;
  tags: string[];
  links: IndexedLink[];
  /** The page as plain text, without Markdown syntax. */
  body: string;
}

/** Marks around matched words in a snippet, as sent by src-tauri/src/index.rs. */
export const MATCH_START = '\u0002';
export const MATCH_END = '\u0003';

export interface SearchHit {
  path: string;
  title: string;
  /** Text around the match, matched words between MATCH_START and MATCH_END. */
  snippet: string;
}

export interface PandocWordOptions {
  markdown: string;
  /** Where the `.docx` goes. */
  output: string;
  /** A CSL JSON file for `[@key]` citations. */
  bibliography?: string;
  /** A citation style (`.csl`) file. */
  csl?: string;
}

export type DeviceKind = 'desktop' | 'tablet';

export interface VaultOwner {
  /** Full path of the vault folder. */
  root: string;
  /** Full path of the folder that was asked about. */
  folder: string;
  /**
   * - `selfVault`: the folder is a vault itself
   * - `benchwork`: it is a `.benchwork` folder or inside one, so it always
   *   belongs to the vault above
   * - `ancestor`: an ordinary folder inside a vault; it could open that
   *   vault or become a separate one
   */
  via: 'selfVault' | 'benchwork' | 'ancestor';
}

export interface VaultChange {
  /** Vault-relative paths that were created, changed, moved or removed. */
  paths: string[];
}

export interface FileInfo {
  size: number;
  /** Milliseconds since the Unix epoch, or null if unknown. */
  modified: number | null;
}

export interface DirEntry {
  name: string;
  /** Vault-relative path. */
  path: string;
  isDir: boolean;
  size: number;
  /** Milliseconds since the Unix epoch, or null if unknown. */
  modified: number | null;
}
