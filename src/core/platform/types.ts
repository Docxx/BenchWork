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
  findVaultRoot(path: string): Promise<string | null>;

  /** Opens a folder as the vault. Resolves to its full path for display. */
  setVaultRoot(root: string): Promise<string>;

  listDir(path: string): Promise<DirEntry[]>;
  readText(path: string): Promise<string>;
  /** Writes via a temporary file and rename. The parent folder must exist. */
  writeTextAtomic(path: string, text: string): Promise<void>;
  /** Creates the folder and any missing parents. */
  ensureDir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;

  /** Per-device settings, stored outside the vault. Null if never saved. */
  loadAppSettings(): Promise<unknown>;
  saveAppSettings(settings: unknown): Promise<void>;
}

export type DeviceKind = 'desktop' | 'tablet';

export interface DirEntry {
  name: string;
  /** Vault-relative path. */
  path: string;
  isDir: boolean;
  size: number;
  /** Milliseconds since the Unix epoch, or null if unknown. */
  modified: number | null;
}
