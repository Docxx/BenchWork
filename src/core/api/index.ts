/**
 * The public module API. Modules in src/modules/<id>/ may import only from
 * here (enforced by ESLint), so the core can change behind it freely.
 *
 * Phase 0 offers sidebar panels, private storage and clean-up. Phase 2 adds
 * page types, commands, file handlers, and access to the vault and the app.
 * Phase 3 adds settings panels and citations. Phase 5 adds full-page views
 * and Pandoc. Block renderers and index hooks are added in the phases that
 * first need them.
 */
import type { ReactNode } from 'react';
import type { PdfDocument } from '../files/pdf';
import type { InkPoint, InkStroke, InkTool } from '../ink/inkFile';
import type {
  DeviceKind,
  DirEntry,
  FileInfo,
  HandwritingRecognizer,
  ProgramArg,
  ProgramResult,
  ProgramRun,
  ProgramRunner,
  VaultChange,
} from '../platform/types';
import type { ModuleManifest } from '../modules/manifest';

export type {
  DeviceKind,
  DirEntry,
  FileInfo,
  HandwritingRecognizer,
  ProgramArg,
  ProgramResult,
  ProgramRun,
  ProgramRunner,
  InkPoint,
  InkStroke,
  InkTool,
  ModuleManifest,
  VaultChange,
};
export { newStrokeId } from '../ink/inkFile';
export type { PdfRender } from '../files/pdf';
export type { PdfDocument };

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
  readonly citations: ModuleCitations;
  /** Pen writing: changing strokes as they are finished, and tools of its own. */
  readonly ink: ModuleInk;
  /** Running the person's own programs, such as Python scripts; null on the tablet. */
  readonly programs: ProgramRunner | null;
  /** The internet: reading from the sites named in manifest.json, and opening links. */
  readonly web: ModuleWeb;
  /** Converting Markdown with Pandoc, if it is installed. Desktop only. */
  readonly pandoc: ModulePandoc;
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
  /** For `link` and `links`: pages of this type are offered first, such as `protocol`. */
  linkType?: string;
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
  /** Opens a PDF's bytes for drawing its pages, with pdf.js. */
  openPdf(bytes: Uint8Array): Promise<PdfDocument>;
}

/** Shows files of a custom type when they are opened from the sidebar. */
export interface FileHandlerSpec {
  /** Must start with the module id and a dot. */
  id: string;
  /** File endings it handles, lower case, such as `.dataset.yaml`. */
  extensions: string[];
  /** What these files are called, such as "Dataset". */
  name: string;
  /**
   * The view watches the file itself, so the app keeps it open when the
   * file changes on disk instead of starting it afresh. For editors that
   * save the file.
   */
  watchesFile?: boolean;
  /** Shows the pen tools above the view, for views written on with the pen. */
  penTools?: boolean;
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
  /** A file's bytes, such as a spreadsheet. Files over 64 MB fail with TooLarge. */
  readBytes(path: string): Promise<Uint8Array>;
  /** Replaces a file with bytes, safely like writeText. */
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  /**
   * Keeps a recovery copy of a file in BenchWork's snapshots before it is
   * changed, as the core does for pages. Files over 64 MB are not copied.
   */
  keepSnapshot(path: string): Promise<void>;
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
  /** A URL an <img> can show a vault file from, or null if there is none. */
  fileUrl(path: string): string | null;
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
  /** When the file last changed, in milliseconds, or null if not known. */
  changed: number | null;
}

export interface ModuleApp {
  /**
   * Opens a page in the editor, or another file in its viewer. With
   * `heading`, the editor goes to the first heading with that text.
   */
  open(path: string, options?: { heading?: string }): Promise<void>;
  /** Creates a notebook (with `folder` empty) or a section. Returns its path, or null. */
  createFolder(folder: string, title: string): Promise<string | null>;
  /**
   * Creates a page, optionally of a registered type, and opens it. With
   * `content`, the page starts with that, instead of a typed page's usual
   * start. Returns its path, or null.
   */
  createPage(
    folder: string,
    title: string,
    type?: string,
    content?: NewPageContent,
  ): Promise<string | null>;
  /** The page open in the editor, or null. */
  openPage(): string | null;
  /**
   * Types plain text into the open page at the cursor, as if typed there.
   * False if no page is open in the editor.
   */
  insertText(text: string): boolean;
  /** Every item with dates, from every schedule source, for the planner. */
  scheduled(): Promise<ScheduledItem[]>;
  /** Gives an item new dates, through the source it came from. */
  reschedule(key: string, start: string, end: string): Promise<void>;
  /** Today's daily page, made if there is none yet; null if no vault is open. */
  todayPage(): Promise<string | null>;
  /**
   * Adds Markdown, such as a checklist line, to the end of a page. An open
   * page is saved first, and shows the addition straight away.
   */
  appendToPage(path: string, markdown: string): Promise<void>;
  /** Opens a module's full-page view, with an optional parameter such as a page path. */
  openView(id: string, param?: string): Promise<void>;
  /** A page's properties (its frontmatter keys), or null if they cannot be read. */
  pageProperties(path: string): Promise<Record<string, unknown> | null>;
  /**
   * Sets or (with null) removes properties of a page, leaving the rest of it
   * exactly as it is. Saved straight away, also when the page is open.
   */
  setPageProperties(path: string, changes: Record<string, unknown>): Promise<void>;
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
  /** The module's own options, shown under it in Settings > Modules while it is on. */
  registerSettingsPanel(spec: SettingsPanelSpec): Disposable;
  /** A view filling the main area, opened with app.openView, such as a timeline. */
  registerPageView(spec: PageViewSpec): Disposable;
  /**
   * A widget, such as tasks due today or a timer, which people place on
   * Home, under the notebooks, or beside pages.
   */
  registerWidget(spec: WidgetSpec): Disposable;
  /** Marks on the calendar, such as tasks due or planned dates. */
  registerCalendarSource(spec: CalendarSourceSpec): Disposable;
  /** Things with dates for the planner's chart, such as tasks or planned pages. */
  registerScheduleSource(spec: ScheduleSourceSpec): Disposable;
}

/** Something with dates, as a bar on the planner's chart. */
export interface ScheduledItem {
  /** Unique: its source's id, a colon, then the source's own key. */
  key: string;
  title: string;
  /** The page it is written in, opened by a click. */
  path: string;
  /** `YYYY-MM-DD`; `end` is the last day, included. */
  start: string;
  end: string;
  milestone: boolean;
  /** 0 to 1. */
  progress: number;
  done: boolean;
  /** Who it is for, if anyone. */
  person: string | null;
  /** 1 (highest) to 5 (lowest), or null. */
  priority: number | null;
  /** The notebook it is in, for grouping. */
  notebook: string;
  /** Keys of the items it waits for. */
  after: string[];
  /** The key of the item it is part of, as a subtask. */
  parent: string | null;
  /** Its dates come from its parts, so it is not moved by itself. */
  summary?: boolean;
}

export interface ScheduleSourceSpec {
  /** Must start with the module id and a dot; every key it gives starts with it and a colon. */
  id: string;
  /** What its items are, such as "Tasks". */
  title: string;
  items(): Promise<ScheduledItem[]>;
  /** Writes new dates for one of its items. */
  move(key: string, start: string, end: string): Promise<void>;
}

export interface WidgetSpec {
  /** Must start with the module id and a dot. */
  id: string;
  /** Its heading, and its tab's name. */
  title: string;
  /** A small icon, about 17 pixels; the first letter of the title if left out. */
  icon?: ReactNode;
  /** Takes two columns on Home where there is room. */
  wide?: boolean;
  /**
   * Where it shows until someone moves it: a card on Home, a tab beside
   * pages, both, or neither (only once added).
   */
  starts?: { home?: boolean; side?: boolean };
  /** `page` is the open page's path, or null when none is open. */
  render: (page: string | null) => ReactNode;
}

/** Something to show on a day of the calendar. */
export interface CalendarMark {
  /** `YYYY-MM-DD`. */
  date: string;
  title: string;
  /** What a click opens, if anything. */
  path?: string;
  /** Shown as a coloured dot: a section colour name, such as `blue`. */
  colour?: string;
}

export interface CalendarSourceSpec {
  /** Must start with the module id and a dot. */
  id: string;
  /** What its marks are, such as "Tasks due". */
  title: string;
  /** Marks for days from `from` to `to`, both `YYYY-MM-DD` and included. */
  marks(from: string, to: string): Promise<CalendarMark[]>;
}

export interface PageViewSpec {
  /** Must start with the module id and a dot. */
  id: string;
  /** Shown at the top of the view. */
  title: string;
  /** `param` is what openView was given, such as the page the view is about. */
  render: (param: string | null) => ReactNode;
  /**
   * Listed under Tools in the sidebar and on Home, opened without a
   * parameter. Left out for views about one page, such as a mind map.
   */
  tool?: {
    icon: ReactNode;
    /** A few words on what it is for, shown on Home. */
    hint: string;
  };
  /**
   * A button at the top of every page, opening the view about that page,
   * such as its mind map. The view's title is the button's label.
   */
  pageButton?: { icon: ReactNode };
}

// ---- Pandoc ----

export interface ModulePandoc {
  /** Pandoc's version, such as `3.5`, or null if it cannot be found. */
  version(): Promise<string | null>;
  /**
   * Converts Markdown to a Word file at `output` (a vault path ending
   * `.docx`), formatting `[@key]` citations from `bibliography` (a CSL JSON
   * file in the vault) in the style of `csl`, if given. Images are found
   * relative to the vault folder.
   */
  toWord(options: {
    markdown: string;
    output: string;
    bibliography?: string;
    csl?: string;
  }): Promise<void>;
}

export interface SettingsPanelSpec {
  /** Must start with the module id and a dot. */
  id: string;
  render: () => ReactNode;
}

// ---- Ink ----

export interface ModuleInk {
  /**
   * Makes `element` a place to write with the pen, using the app's pen
   * tools, stroke filters and module tools, as in drawings on pages. The
   * element must have a size; strokes are in its CSS pixels. Removed when
   * the module is switched off, or with `dispose`.
   */
  attach(element: HTMLElement, options: InkAttachOptions): InkAttachment;
  /** The device's handwriting to text, such as on the tablet; null where there is none. */
  readonly handwriting: HandwritingRecognizer | null;
  /**
   * Reads the text in drawings on pages, shortly after writing stops; the
   * core saves it in the drawing's file, where search finds it. The first
   * registered is used.
   */
  registerRecogniser(spec: InkRecogniserSpec): Disposable;
  /** Changes each stroke as it is finished, such as straightening a line. */
  registerStrokeFilter(spec: StrokeFilterSpec): Disposable;
  /** A tool beside the pen, highlighter and eraser, such as a lasso. */
  registerTool(spec: InkToolSpec): Disposable;
}

export interface InkRecogniserSpec {
  /** Must start with the module id and a dot. */
  id: string;
  /** The text written in strokes; empty if none. */
  recognise(strokes: readonly InkStroke[]): Promise<string>;
}

export interface InkAttachOptions {
  strokes: readonly InkStroke[];
  /** The strokes after each change, to save. */
  onChange: (strokes: InkStroke[]) => void;
  /** False for ink that can only be read. */
  editable?: boolean;
}

export interface InkAttachment extends Disposable {
  /** Shows strokes changed elsewhere. */
  setStrokes(strokes: readonly InkStroke[]): void;
  setEditable(editable: boolean): void;
}

export interface StrokeFilterSpec {
  /** Must start with the module id and a dot. */
  id: string;
  /**
   * The stroke as it should be kept: the same one, a new one with the same
   * id, or null for none, as when the stroke was a gesture.
   */
  filter: (stroke: InkStroke, info: StrokeFilterInfo) => InkStroke | null;
}

export interface StrokeFilterInfo {
  /** The pen stayed still for a moment before it lifted. */
  held: boolean;
  /** The drawing's other strokes. */
  others: readonly InkStroke[];
  /** Removes other strokes from the drawing, such as those scribbled over. */
  erase: (ids: readonly string[]) => void;
}

/** A point on a drawing, in CSS pixels from its top left. */
export interface InkToolPoint {
  x: number;
  y: number;
}

/** One drawing, as a tool sees it while the pen is on it. */
export interface InkToolArea {
  /** The drawing's strokes now. */
  strokes(): readonly InkStroke[];
  /** Replaces the strokes, shows them and saves the drawing. */
  setStrokes(strokes: readonly InkStroke[]): void;
  /** Shows strokes without saving, while something is being dragged. */
  previewStrokes(strokes: readonly InkStroke[]): void;
  /** A layer over the drawing for the tool's own marks, in CSS pixels; cleared by clearOverlay. */
  readonly overlay: CanvasRenderingContext2D;
  clearOverlay(): void;
  /** The drawing's element, for buttons the tool shows beside a selection. */
  readonly element: HTMLElement;
  /** Puts typed text in the page below the drawing; missing where there is no page, as on a PDF. */
  readonly addText?: (text: string) => void;
}

export interface InkToolSpec {
  /** Must start with the module id and a dot. */
  id: string;
  /** Shown as the tool button's tooltip and read out by screen readers. */
  title: string;
  /** A small icon for the button, about 17 pixels. */
  icon: ReactNode;
  down(area: InkToolArea, point: InkToolPoint): void;
  move(area: InkToolArea, point: InkToolPoint): void;
  up(area: InkToolArea, point: InkToolPoint): void;
  /** Another tool was chosen, or the drawing closed: put away anything shown. */
  end?(area: InkToolArea): void;
}

// ---- Citations ----

/**
 * Citations are written `[@key]` in pages (Pandoc's form). A module that
 * knows a reference library says what each key is; without one, citations
 * show as their keys. One module provides citations at a time.
 */
export interface ModuleCitations {
  register(spec: CitationProviderSpec): Disposable;
  /** Asks open pages to redraw their citations, such as after the library changed. */
  refresh(): void;
  /** The provider's library file (a vault path), for formatting citations, or null. */
  bibliography(): string | null;
}

export interface CitationProviderSpec {
  /** Must start with the module id and a dot. */
  id: string;
  /** The work behind a key, or null if the library does not have it. */
  describe(key: string): CitedWork | null;
  /** Works for the `[@` menu, best first; may wait for the library to load. */
  suggest(query: string): CitationChoice[] | Promise<CitationChoice[]>;
  /** Called when a citation is clicked: opens the key's note. */
  open(key: string): void | Promise<void>;
  /** The library file as a vault path, such as for Pandoc, or null if there is none. */
  bibliography?(): string | null;
}

export interface CitedWork {
  /** For the chip, such as `Smith et al. 2024`. */
  short: string;
  /** For the tooltip: the full reference. */
  full: string;
}

export interface CitationChoice {
  key: string;
  label: string;
  /** A second line, such as the title. */
  detail: string;
}

export interface SidebarPanelSpec {
  /** Must start with the module id and a dot, such as `hello.panel`. */
  id: string;
  title: string;
  render: () => ReactNode;
}

export interface ModuleWeb {
  /**
   * Reads a web address's text, such as a search's JSON. Only https
   * addresses on the sites the manifest lists under "network"; others fail.
   */
  getText(url: string): Promise<string>;
  /** Opens a web address in the device's browser. */
  open(url: string): Promise<void>;
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
