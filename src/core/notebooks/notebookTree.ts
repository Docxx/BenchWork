import type { DirEntry } from '../platform';
import { compareEntries, type TreeState } from '../vault/fileTree';
import { SECTION_FILE } from './sectionMeta';

/**
 * How the vault looks in the sidebar: top-level folders are notebooks,
 * folders inside them are sections, and `.md` files are pages. Everything
 * here is worked out from the folder listings; nothing is stored.
 */

export type NodeKind = 'notebook' | 'section' | 'page' | 'file';

export interface NotebookNode {
  kind: NodeKind;
  path: string;
  /** File or folder name on disk. */
  name: string;
  /** What the sidebar shows: a page's name without `.md`. */
  title: string;
  isDir: boolean;
  colour: string | null;
}

export type NotebookRow =
  | { kind: 'node'; node: NotebookNode; depth: number; expanded: boolean }
  | { kind: 'loading' | 'empty'; parent: string; depth: number }
  | { kind: 'error'; parent: string; depth: number; message: string };

export interface LayoutOptions {
  /** Also show files that are not pages, and the reserved folders. */
  showAllFiles: boolean;
}

export const DAILY_NOTEBOOK = 'Daily';
/** Top-level folders BenchWork uses for its own purposes, hidden from the notebook list. */
export const RESERVED_FOLDERS = ['templates', 'attachments'];
export const PAGE_EXTENSION = '.md';

export function isPage(name: string): boolean {
  return name.toLowerCase().endsWith(PAGE_EXTENSION) && name.length > PAGE_EXTENSION.length;
}

export function pageTitle(name: string): string {
  return isPage(name) ? name.slice(0, -PAGE_EXTENSION.length) : name;
}

function isReserved(entry: DirEntry, atRoot: boolean): boolean {
  return atRoot && entry.isDir && RESERVED_FOLDERS.includes(entry.name.toLowerCase());
}

/** Whether an entry appears in the sidebar at all. */
export function isShown(entry: DirEntry, atRoot: boolean, options: LayoutOptions): boolean {
  if (entry.name === SECTION_FILE) return false;
  if (options.showAllFiles) return true;
  if (entry.isDir) return !isReserved(entry, atRoot);
  return isPage(entry.name);
}

/**
 * Orders a folder's entries: names in `order` first, in that order, then the
 * rest (folders first, natural order). At the vault root the Daily notebook
 * always comes first.
 */
export function orderEntries(
  entries: readonly DirEntry[],
  order: readonly string[],
  atRoot: boolean,
): DirEntry[] {
  const position = new Map(order.map((name, i) => [name, i]));
  const sorted = [...entries].sort((a, b) => {
    if (atRoot) {
      const aDaily = a.isDir && a.name === DAILY_NOTEBOOK;
      const bDaily = b.isDir && b.name === DAILY_NOTEBOOK;
      if (aDaily !== bDaily) return aDaily ? -1 : 1;
    }
    const pa = position.get(a.name);
    const pb = position.get(b.name);
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return compareEntries(a, b);
  });
  return sorted;
}

function nodeFor(entry: DirEntry, depth: number, colour: string | null): NotebookNode {
  const kind: NodeKind = entry.isDir
    ? depth === 0
      ? 'notebook'
      : 'section'
    : isPage(entry.name)
      ? 'page'
      : 'file';
  return {
    kind,
    path: entry.path,
    name: entry.name,
    title: kind === 'page' ? pageTitle(entry.name) : entry.name,
    isDir: entry.isDir,
    colour,
  };
}

/** The children of a loaded folder as sidebar nodes, in sidebar order. */
export function folderNodes(
  tree: TreeState,
  path: string,
  depth: number,
  options: LayoutOptions,
): NotebookNode[] | null {
  const folder = tree.folders[path];
  if (folder?.status !== 'loaded') return null;
  const atRoot = path === '';
  const shown = folder.entries.filter((e) => isShown(e, atRoot, options));
  return orderEntries(shown, folder.meta?.order ?? [], atRoot).map((e) =>
    nodeFor(e, depth, folder.childColours?.[e.path] ?? null),
  );
}

/** Flattens the open part of the vault into the rows to draw, top to bottom. */
export function notebookRows(tree: TreeState, options: LayoutOptions): NotebookRow[] {
  const expanded = new Set(tree.expanded);
  const rows: NotebookRow[] = [];

  function walk(path: string, depth: number): void {
    const folder = tree.folders[path];
    if (!folder || folder.status === 'loading') {
      rows.push({ kind: 'loading', parent: path, depth });
      return;
    }
    if (folder.status === 'error') {
      rows.push({ kind: 'error', parent: path, depth, message: folder.message });
      return;
    }
    const nodes = folderNodes(tree, path, depth, options) ?? [];
    if (nodes.length === 0) {
      rows.push({ kind: 'empty', parent: path, depth });
      return;
    }
    for (const node of nodes) {
      const open = node.isDir && expanded.has(node.path);
      rows.push({ kind: 'node', node, depth, expanded: open });
      if (open) walk(node.path, depth + 1);
    }
  }

  walk('', 0);
  return rows;
}
