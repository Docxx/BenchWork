import type { SectionMeta } from '../notebooks/sectionMeta';
import type { DirEntry } from '../platform';

/** Load state of one folder in the tree. */
export type FolderState =
  | {
      status: 'loaded';
      entries: DirEntry[];
      /** This folder's own `_section.yaml`, if it has one. */
      meta?: SectionMeta;
      /** Colours of the folders inside, from their `_section.yaml`, by path. */
      childColours?: Record<string, string>;
    }
  | { status: 'loading' }
  | { status: 'error'; message: string };

export interface TreeState {
  /** Folder contents by vault-relative path; `""` is the vault root. */
  folders: Record<string, FolderState>;
  /** Folders that are open, in the order they were opened. */
  expanded: string[];
  selected: string | null;
}

export function emptyTree(): TreeState {
  return { folders: {}, expanded: [], selected: null };
}

/** One line in the tree as drawn, from walking the open folders. */
export type TreeRow =
  | { kind: 'entry'; entry: DirEntry; depth: number; expanded: boolean }
  | { kind: 'loading' | 'empty'; parent: string; depth: number }
  | { kind: 'error'; parent: string; depth: number; message: string };

const collator = new Intl.Collator('en-GB', { numeric: true, sensitivity: 'base' });

/** Hidden files and folders (such as `.benchwork`) never show in the tree. */
export function isHidden(name: string): boolean {
  return name.startsWith('.');
}

/**
 * Folders first, then files, each in natural order: `Day 2` before `Day 10`,
 * ignoring case. Exact ties fall back to code-point order so the result is stable.
 */
export function compareEntries(a: DirEntry, b: DirEntry): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return collator.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

export function visibleEntries(entries: readonly DirEntry[]): DirEntry[] {
  return entries.filter((e) => !isHidden(e.name)).sort(compareEntries);
}

/** Flattens the open part of the tree into the rows to draw, top to bottom. */
export function treeRows(tree: TreeState): TreeRow[] {
  const expanded = new Set(tree.expanded);
  const rows: TreeRow[] = [];

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
    if (folder.entries.length === 0) {
      rows.push({ kind: 'empty', parent: path, depth });
      return;
    }
    for (const entry of folder.entries) {
      const open = entry.isDir && expanded.has(entry.path);
      rows.push({ kind: 'entry', entry, depth, expanded: open });
      if (open) walk(entry.path, depth + 1);
    }
  }

  walk('', 0);
  return rows;
}
