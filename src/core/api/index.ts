/**
 * The public module API. Modules in src/modules/<id>/ may import only from
 * here (enforced by ESLint), so the core can change behind it freely.
 *
 * Phase 0 offers sidebar panels, private storage and clean-up. Phase 2 adds
 * page types, commands, file handlers, and access to the vault and the app.
 * Block renderers, settings panels and index hooks are added in the phases
 * that first need them.
 */
import type { ReactNode } from 'react';
import type { DeviceKind, DirEntry, FileInfo, VaultChange } from '../platform/types';
import type { ModuleManifest } from '../modules/manifest';

export type { DeviceKind, DirEntry, FileInfo, ModuleManifest, VaultChange };

/** What a module's `index.ts` exports as its default. */
export interface ModuleDefinition {
  /**
   * Called when the module is switched on, or when a vault opens with it on.
   * Register everything through `ctx`; it is all removed again on switch-off.
   * If this throws, the module is marked as failed and the core carries on.
   */
  activate(ctx: ModuleContext): void | Promise<void>;
  /** Optional extra clean-up, run before everything registered is removed. */
  deactivate?(): void | Promise<void>;
}

/** Identity helper that gives a module definition its type. */
export function defineModule(definition: ModuleDefinition): ModuleDefinition {
  return definition;
}

export interface ModuleContext {
  readonly manifest: ModuleManifest;
  /** The device the app is running on. */
  readonly platform: DeviceKind;
  readonly views: ModuleViews;
  readonly pageTypes: ModulePageTypes;
  readonly commands: ModuleCommands;
  readonly files: ModuleFiles;
  /** JSON files in `.benchwork/modules/<id>/`, the module's private folder. */
  readonly storage: ModuleStorage;
  /** The vault's files. Modules keep their files in normal vault folders. */
  readonly vault: ModuleVault;
  /** Pages, links and messages in the app. */
  readonly app: ModuleApp;
  readonly log: ModuleLogger;
  /** Runs `fn` when the module is switched off, for timers and listeners. */
  onDispose(fn: () => void): void;
}

// ---- Page types ----

export interface ModulePageTypes {
  register(spec: PageTypeSpec): Disposable;
}

/**
 * A kind of page, named by its frontmatter `type`. Its fields show in the
 * page's Properties; with the module off, the page is an ordinary page and
 * its properties are kept as they are.
 */
export interface PageTypeSpec {
  /** The frontmatter `type` value, such as `experiment`. */
  type: string;
  /** Shown in menus, as in "New experiment". */
  name: string;
  /** The properties pages of this type have, in the order shown. */
  fields: PropertyField[];
  /** What a new page of this type starts with. */
  create?: (info: NewPageInfo) => NewPageContent | Promise<NewPageContent>;
}

export type PropertyKind =
  /** One line of text. */
  | 'text'
  /** A day, written `YYYY-MM-DD`. */
  | 'date'
  /** One of `options`. */
  | 'choice'
  /** Several short values, such as genotypes. */
  | 'list'
  /** A link to one page or record, written `[[Name]]`. */
  | 'link'
  /** Links to several pages or records. */
  | 'links';

export interface PropertyField {
  /** The frontmatter key. */
  key: string;
  label: string;
  kind: PropertyKind;
  /** For `choice`. */
  options?: string[];
}

export interface NewPageInfo {
  /** Where the page is being made. */
  folder: string;
  title: string;
  now: Date;
}

export interface NewPageContent {
  /** Frontmatter keys besides `id`, `type` and `created`, which the core sets. */
  properties?: Record<string, unknown>;
  /** Markdown after the frontmatter. */
  body?: string;
}

// ---- Commands ----

export interface ModuleCommands {
  register(spec: CommandSpec): Disposable;
}

export type CommandPlace =
  /** The sidebar's New menu, beside New notebook. */
  | 'new'
  /** The menu of each notebook and section. */
  | 'folder';

export interface CommandSpec {
  /** Must start with the module id and a dot, such as `research.newProject`. */
  id: string;
  title: string;
  /** Menus it appears in, besides the command list (Ctrl+K). */
  places?: CommandPlace[];
  run(target: CommandTarget): void | Promise<void>;
}

export interface CommandTarget {
  /** The notebook or section it was chosen from, or null. */
  folder: string | null;
}

// ---- File handlers ----

export interface ModuleFiles {
  register(spec: FileHandlerSpec): Disposable;
}

/** Shows files of a custom type when they are opened from the sidebar. */
export interface FileHandlerSpec {
  /** Must start with the module id and a dot. */
  id: string;
  /** File endings it handles, lower case, such as `.dataset.yaml`. */
  extensions: string[];
  /** What these files are called, such as "Dataset". */
  name: string;
  render: (file: { path: string }) => ReactNode;
}

// ---- Vault and app ----

/**
 * Reading and writing vault files. Paths are vault-relative with `/`.
 * There is no delete: a module can never remove a user's files.
 */
export interface ModuleVault {
  listDir(path: string): Promise<DirEntry[]>;
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  /** Replaces a file safely, via a temporary file. */
  writeText(path: string, text: string): Promise<void>;
  /** Creates a file, failing if one is already there. */
  createNew(path: string, text: string): Promise<void>;
  ensureDir(path: string): Promise<void>;
  /** A free file name in `folder`: `base` + `ext`, or `base 2` + `ext`, and so on. */
  freeName(folder: string, base: string, ext: string): Promise<string>;
  /** A record's values, from `<name>.<kind>.yaml`. `error` says why it could not be read. */
  readRecord(path: string): Promise<RecordData>;
  /**
   * Sets top-level keys in a record, keeping its comments and order; null
   * removes a key. Refuses a record that could not be read.
   */
  updateRecord(path: string, changes: Record<string, unknown>): Promise<void>;
  /**
   * Creates `<folder>/<name>.<kind>.yaml` under a free name, with an `id`
   * and `created` time before `data`. Returns its path.
   */
  createRecord(
    folder: string,
    name: string,
    kind: string,
    data: Record<string, unknown>,
  ): Promise<string>;
  /** Size and time of a vault file, or of a full path outside the vault with `external`. */
  fileInfo(path: string, external?: boolean): Promise<FileInfo>;
  /** SHA-256 as lower-case hex. `external` as for fileInfo. */
  hashFile(path: string, external?: boolean): Promise<string>;
  /** Asks the user to choose files. Full paths; empty if cancelled. */
  pickFiles(options: { title: string; multiple: boolean }): Promise<string[]>;
  /** The vault path of a full path, or null if it is outside the vault. */
  vaultPathOf(fullPath: string): string | null;
  /** Calls `listener` when vault files change. Stopped when the module is switched off. */
  watch(listener: (change: VaultChange) => void): Disposable;
}

export interface RecordData {
  data: Record<string, unknown>;
  error: string | null;
}

/** A page or record in the vault, from the search index. */
export interface VaultItem {
  path: string;
  title: string;
  /** The frontmatter `type`, or the record kind, such as `dataset`. */
  type: string;
}

export interface ModuleApp {
  /** Opens a page in the editor, or another file in its viewer. */
  open(path: string): Promise<void>;
  /** Creates a notebook (with `folder` empty) or a section. Returns its path, or null. */
  createFolder(folder: string, title: string): Promise<string | null>;
  /** Creates a page, optionally of a registered type, and opens it. Returns its path, or null. */
  createPage(folder: string, title: string, type?: string): Promise<string | null>;
  /** Asks the user for a line of text, such as a name. Null if cancelled. */
  askText(options: { title: string; label: string; initial?: string }): Promise<string | null>;
  /** Shows a short message. */
  notify(message: string): void;
  /** Every page and record, by path. */
  items(): Promise<VaultItem[]>;
  /** Items linking to `path`. */
  linksTo(path: string): Promise<VaultItem[]>;
  /** What to write between `[[` and `]]` to link to `path`. */
  linkTarget(path: string): Promise<string>;
  /** The path a link means, seen from `from`, or null if it points at nothing. */
  resolveLink(target: string, from: string | null): Promise<string | null>;
}

export interface ModuleViews {
  registerSidebarPanel(spec: SidebarPanelSpec): Disposable;
}

export interface SidebarPanelSpec {
  /** Must start with the module id and a dot, such as `hello.panel`. */
  id: string;
  title: string;
  render: () => ReactNode;
}

export interface ModuleStorage {
  /** Reads `<name>` (a plain file name such as `state.json`); null if it does not exist. */
  read<T = unknown>(name: string): Promise<T | null>;
  write(name: string, data: unknown): Promise<void>;
}

export interface ModuleLogger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface Disposable {
  dispose(): void;
}
