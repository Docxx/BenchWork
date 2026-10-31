import {
  localTimestamp,
  pageProperties,
  parsePage,
  serialisePage,
  updateProperties,
} from '../pages/frontmatter';
import {
  baseName,
  joinVaultPath,
  parentVaultPath,
  PlatformError,
  type PlatformAdapter,
} from '../platform';
import { recordFileName, recordKind } from '../records/records';
import { isPage, PAGE_EXTENSION, pageTitle } from './notebookTree';
import {
  type FolderSort,
  parseSectionMeta,
  placeInOrder,
  renameInOrder,
  SECTION_FILE,
  serialiseSectionMeta,
  type SectionMeta,
} from './sectionMeta';

/**
 * Creating, renaming, moving and recycling notebooks, sections and pages.
 * Each keeps the parent folder's `_section.yaml` order in step, and none of
 * them ever overwrites or permanently deletes anything.
 */

/** A name the user typed that cannot be used, with a message to show them. */
export class NameError extends Error {
  override readonly name = 'NameError';
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * Turns a title into a safe file or folder name: characters Windows cannot
 * store become `-`, and trailing dots and spaces go.
 */
export function safeName(title: string): string {
  let name = title.replace(/[\u0000-\u001f<>:"/\\|?*]/g, '-').trim();
  name = name.replace(/[. ]+$/, '');
  if (name === '' || name === '.' || name === '..') {
    throw new NameError('Please enter a name.');
  }
  const stem = name.split('.')[0] ?? name;
  if (RESERVED.test(stem)) name = `${name}_`;
  if (name.length > 200) throw new NameError('That name is too long.');
  return name;
}

/** `base` + `ext` if that name is free in `folder`, else `base 2` + `ext`, and so on. */
export async function freeName(
  platform: PlatformAdapter,
  folder: string,
  base: string,
  ext: string,
): Promise<string> {
  for (let n = 1; n < 1000; n += 1) {
    const candidate = n === 1 ? `${base}${ext}` : `${base} ${String(n)}${ext}`;
    if (!(await platform.exists(joinVaultPath(folder, candidate)))) return candidate;
  }
  throw new NameError('Could not find a free name.');
}

function inUse(kind: string, name: string): NameError {
  return new NameError(`There is already ${kind} called "${name}" here.`);
}

// ---- Section settings ----

export async function readSectionMeta(
  platform: PlatformAdapter,
  folder: string,
): Promise<SectionMeta | null> {
  const path = joinVaultPath(folder, SECTION_FILE);
  if (!(await platform.exists(path))) return null;
  return parseSectionMeta(await platform.readText(path));
}

async function updateSectionMeta(
  platform: PlatformAdapter,
  folder: string,
  change: (meta: SectionMeta) => SectionMeta,
): Promise<void> {
  const path = joinVaultPath(folder, SECTION_FILE);
  const existing = (await platform.exists(path)) ? await platform.readText(path) : null;
  const before = parseSectionMeta(existing ?? '');
  const after = change(before);
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const text = serialiseSectionMeta(existing, after);
  if (text !== null) await platform.writeTextAtomic(path, text);
  // Nothing left to store: empty the file rather than delete it.
  else if (existing !== null) await platform.writeTextAtomic(path, '');
}

async function removeFromOrder(platform: PlatformAdapter, path: string): Promise<void> {
  const parent = parentVaultPath(path) ?? '';
  const name = baseName(path);
  if ((await readSectionMeta(platform, parent))?.order.includes(name)) {
    await updateSectionMeta(platform, parent, (m) => ({
      ...m,
      order: m.order.filter((n) => n !== name),
    }));
  }
}

// ---- Create ----

/**
 * Creates a notebook (at the root) or section. With no title it is called
 * "New notebook" or "New section", numbered if that is taken.
 */
export async function createFolder(
  platform: PlatformAdapter,
  parent: string,
  title?: string,
): Promise<string> {
  const name =
    title === undefined
      ? await freeName(platform, parent, parent === '' ? 'New notebook' : 'New section', '')
      : safeName(title);
  const path = joinVaultPath(parent, name);
  if (await platform.exists(path)) throw inUse(parent === '' ? 'a notebook' : 'something', name);
  await platform.ensureDir(path);
  return path;
}

export interface NewPageOptions {
  title?: string;
  /** The name to number when there is no title. Defaults to "Untitled page". */
  untitled?: string;
  /** The page's Markdown after the frontmatter. */
  body?: string;
  /** The whole file, such as from a template, given the new id, created time and title. */
  text?: (id: string, created: string, title: string) => string;
  newId?: () => string;
  now?: () => string;
  /** `free` starts the page with a free layout, unless its text already says. */
  layout?: 'document' | 'free';
}

/** A new page's text with `layout: free`, unless it already has a layout or its frontmatter cannot be read. */
export function withLayout(text: string, layout: 'document' | 'free' | undefined): string {
  if (layout !== 'free') return text;
  const page = parsePage(text);
  if (page.error !== null || pageProperties(page)['layout'] !== undefined) return text;
  return serialisePage(updateProperties(page, { layout: 'free' }));
}

/** Creates a page with an id, so links to it survive renames. Returns its path. */
export async function createPage(
  platform: PlatformAdapter,
  folder: string,
  options: NewPageOptions = {},
): Promise<string> {
  const name =
    options.title === undefined
      ? await freeName(platform, folder, options.untitled ?? 'Untitled page', PAGE_EXTENSION)
      : `${safeName(options.title)}${PAGE_EXTENSION}`;
  const path = joinVaultPath(folder, name);
  const id = (options.newId ?? (() => crypto.randomUUID()))();
  const created = (options.now ?? localTimestamp)();
  const text = withLayout(
    options.text?.(id, created, pageTitle(name)) ??
      `---\nid: ${id}\ncreated: ${created}\n---\n${options.body ?? ''}`,
    options.layout,
  );
  try {
    await platform.createNew(path, text);
  } catch (err) {
    if (PlatformError.from(err).kind === 'AlreadyExists') throw inUse('a page', name);
    throw err;
  }
  return path;
}

// ---- Rename, move, reorder ----

/** The file name for a new title: pages keep their `.md`, records their `.<kind>.yaml`. */
function renamedName(path: string, title: string): string {
  const name = safeName(title);
  const kind = recordKind(path);
  if (kind !== null) return recordKind(name) === kind ? name : recordFileName(name, kind);
  return isPage(baseName(path)) && !isPage(name) ? `${name}${PAGE_EXTENSION}` : name;
}

/** Renames a notebook, section or page. Returns its new path. */
export async function renameItem(
  platform: PlatformAdapter,
  path: string,
  title: string,
): Promise<string> {
  const parent = parentVaultPath(path) ?? '';
  const oldName = baseName(path);
  const newName = renamedName(path, title);
  if (newName === oldName) return path;
  const target = joinVaultPath(parent, newName);
  try {
    await platform.rename(path, target);
  } catch (err) {
    if (PlatformError.from(err).kind === 'AlreadyExists') throw inUse('something', newName);
    throw err;
  }
  await updateSectionMeta(platform, parent, (m) => ({
    ...m,
    order: renameInOrder(m.order, oldName, newName),
  }));
  return target;
}

/**
 * Moves an item into another folder, at `index` in that folder's order if
 * given. `siblings` is the folder's current order as shown, so a first
 * reorder can keep everything else where it was. Returns the new path.
 */
export async function moveItem(
  platform: PlatformAdapter,
  path: string,
  folder: string,
  placement?: { index: number; siblings: readonly string[] },
): Promise<string> {
  const name = baseName(path);
  const from = parentVaultPath(path) ?? '';
  if (folder === path || folder.startsWith(`${path}/`)) {
    throw new NameError('A folder cannot be moved inside itself.');
  }
  let target = path;
  if (from !== folder) {
    target = joinVaultPath(folder, name);
    try {
      await platform.rename(path, target);
    } catch (err) {
      if (PlatformError.from(err).kind === 'AlreadyExists') throw inUse('something', name);
      throw err;
    }
    await removeFromOrder(platform, path);
  }
  if (placement) {
    const base = placement.siblings.filter((n) => n !== name);
    await updateSectionMeta(platform, folder, (m) => ({
      ...m,
      order: placeInOrder(base, name, placement.index),
    }));
  }
  return target;
}

// ---- Colour and recycle ----

export async function setColour(
  platform: PlatformAdapter,
  folder: string,
  colour: string | null,
): Promise<void> {
  await updateSectionMeta(platform, folder, (m) => ({ ...m, colour }));
}

export async function setIcon(
  platform: PlatformAdapter,
  folder: string,
  icon: string | null,
): Promise<void> {
  await updateSectionMeta(platform, folder, (m) => ({ ...m, icon }));
}

export async function setSort(
  platform: PlatformAdapter,
  folder: string,
  sort: FolderSort,
): Promise<void> {
  await updateSectionMeta(platform, folder, (m) => ({ ...m, sort }));
}

/** Moves an item to the Recycle Bin and drops it from its folder's order. */
export async function recycleItem(platform: PlatformAdapter, path: string): Promise<void> {
  await platform.trash(path);
  await removeFromOrder(platform, path);
}
