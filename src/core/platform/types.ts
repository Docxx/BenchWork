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
  /** Moves a file or folder to the Recycle Bin. Nothing deletes permanently. */
  trash(path: string): Promise<void>;
  /**
   * Calls `listener` with paths that changed in the open vault, from any
   * source, BenchWork included. Returns a function that stops listening.
   */
  watch(listener: (change: VaultChange) => void): () => void;
  /** A URL an <img> can load a vault file from, or null if there is none. */
  assetUrl(path: string): string | null;

  /** Per-device settings, stored outside the vault. Null if never saved. */
  loadAppSettings(): Promise<unknown>;
  saveAppSettings(settings: unknown): Promise<void>;
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

export interface DirEntry {
  name: string;
  /** Vault-relative path. */
  path: string;
  isDir: boolean;
  size: number;
  /** Milliseconds since the Unix epoch, or null if unknown. */
  modified: number | null;
}
