import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { parentVaultPath } from '../platform';
import { treeRows, type TreeRow } from '../vault/fileTree';
import { useApp } from './AppStoreContext';

type EntryRow = Extract<TreeRow, { kind: 'entry' }>;

const INDENT_PX = 16;

export function FileTree() {
  const tree = useApp((s) => s.tree);
  const toggleFolder = useApp((s) => s.toggleFolder);
  const selectEntry = useApp((s) => s.selectEntry);

  const rows = useMemo(() => treeRows(tree), [tree]);
  const entries = useMemo(() => rows.filter((r): r is EntryRow => r.kind === 'entry'), [rows]);

  const [focused, setFocused] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  // The row that takes Tab focus: the focused one if still shown, else the
  // selection, else the first row.
  const current =
    entries.find((r) => r.entry.path === focused) ??
    entries.find((r) => r.entry.path === tree.selected) ??
    entries[0];

  useEffect(() => {
    // Move DOM focus only when the tree already has it, so loading never steals focus.
    if (!current || !listRef.current?.contains(document.activeElement)) return;
    itemRefs.current.get(current.entry.path)?.focus();
  }, [current]);

  function activate(row: EntryRow): void {
    setFocused(row.entry.path);
    selectEntry(row.entry.path);
    if (row.entry.isDir) void toggleFolder(row.entry.path);
  }

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>): void {
    if (!current) return;
    const index = entries.indexOf(current);
    const move = (i: number) => {
      const target = entries[Math.max(0, Math.min(entries.length - 1, i))];
      if (target) setFocused(target.entry.path);
    };

    switch (event.key) {
      case 'ArrowDown':
        move(index + 1);
        break;
      case 'ArrowUp':
        move(index - 1);
        break;
      case 'Home':
        move(0);
        break;
      case 'End':
        move(entries.length - 1);
        break;
      case 'ArrowRight':
        if (!current.entry.isDir) return;
        if (!current.expanded) void toggleFolder(current.entry.path);
        else if ((entries[index + 1]?.depth ?? 0) > current.depth) move(index + 1);
        break;
      case 'ArrowLeft':
        if (current.entry.isDir && current.expanded) {
          void toggleFolder(current.entry.path);
        } else {
          const parent = parentVaultPath(current.entry.path);
          if (parent) setFocused(parent);
        }
        break;
      case 'Enter':
      case ' ':
        activate(current);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return (
    <ul className="file-tree" role="tree" aria-label="Files" ref={listRef} onKeyDown={onKeyDown}>
      {rows.map((row) => {
        if (row.kind !== 'entry') return <StatusRow key={`${row.kind}:${row.parent}`} row={row} />;
        const { entry } = row;
        return (
          <li
            key={entry.path}
            ref={(el) => {
              if (el) itemRefs.current.set(entry.path, el);
              else itemRefs.current.delete(entry.path);
            }}
            role="treeitem"
            aria-level={row.depth + 1}
            aria-selected={tree.selected === entry.path}
            aria-expanded={entry.isDir ? row.expanded : undefined}
            tabIndex={entry.path === current?.entry.path ? 0 : -1}
            className={entry.isDir ? 'tree-item folder' : 'tree-item file'}
            style={{ paddingLeft: 8 + row.depth * INDENT_PX }}
            title={entry.path}
            onClick={() => {
              activate(row);
            }}
            onFocus={() => {
              setFocused(entry.path);
            }}
          >
            <span className="twisty" aria-hidden="true">
              {entry.isDir ? (row.expanded ? '▾' : '▸') : ''}
            </span>
            <span className="tree-label">{entry.name}</span>
          </li>
        );
      })}
    </ul>
  );
}

function StatusRow({ row }: { row: Exclude<TreeRow, EntryRow> }) {
  const text =
    row.kind === 'loading'
      ? 'Loading…'
      : row.kind === 'error'
        ? row.message
        : row.parent === ''
          ? 'This vault is empty.'
          : 'Empty folder';
  return (
    <li
      role="none"
      className={`tree-status ${row.kind}`}
      style={{ paddingLeft: 8 + row.depth * INDENT_PX + INDENT_PX }}
    >
      {text}
    </li>
  );
}
