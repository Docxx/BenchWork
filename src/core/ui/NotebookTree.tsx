import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import {
  folderNodes,
  notebookRows,
  type NotebookNode,
  type NotebookRow,
} from '../notebooks/notebookTree';
import { SECTION_COLOURS } from '../notebooks/sectionMeta';
import { parentVaultPath } from '../platform';
import { useApp } from './AppStoreContext';
import { Menu, type MenuItem } from './Menu';
import { TemplatePicker } from './TemplatePicker';

type NodeRow = Extract<NotebookRow, { kind: 'node' }>;
type DropPlace = 'before' | 'after' | 'into';

const INDENT_PX = 16;
const DRAG_TYPE = 'application/x-benchwork-path';

/** CSS colour for a section colour name or a colour written by hand. */
export function colourValue(colour: string): string {
  return (SECTION_COLOURS as readonly string[]).includes(colour)
    ? `var(--section-${colour})`
    : colour;
}

const KIND_LABEL: Record<NotebookNode['kind'], string> = {
  notebook: 'notebook',
  section: 'section',
  page: 'page',
  file: 'file',
};

export function NotebookTree() {
  const tree = useApp((s) => s.tree);
  const showAllFiles = useApp((s) => s.settings.showAllFiles);
  const toggleFolder = useApp((s) => s.toggleFolder);
  const selectEntry = useApp((s) => s.selectEntry);
  const createNotebook = useApp((s) => s.createNotebook);
  const createSection = useApp((s) => s.createSection);
  const createPage = useApp((s) => s.createPage);
  const renameItem = useApp((s) => s.renameItem);
  const moveItem = useApp((s) => s.moveItem);
  const setFolderColour = useApp((s) => s.setFolderColour);
  const recycleItem = useApp((s) => s.recycleItem);
  const openPage = useApp((s) => s.openPage);
  const saveAsTemplate = useApp((s) => s.saveAsTemplate);
  const createFromTemplate = useApp((s) => s.createFromTemplate);

  const options = useMemo(() => ({ showAllFiles }), [showAllFiles]);
  const rows = useMemo(() => notebookRows(tree, options), [tree, options]);
  const nodeRows = useMemo(() => rows.filter((r): r is NodeRow => r.kind === 'node'), [rows]);

  const renaming = useApp((s) => s.renaming);
  const setRenaming = useApp((s) => s.setRenaming);
  const [focused, setFocused] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ node: NotebookNode | null; x: number; y: number } | null>(
    null,
  );
  const [confirming, setConfirming] = useState<NotebookNode | null>(null);
  /** The folder a new page from a template goes in, while choosing one. */
  const [templateFolder, setTemplateFolder] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ path: string; place: DropPlace } | null>(null);
  const dragging = useRef<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  // The row that takes Tab focus: the focused one if still shown, else the
  // selection, else the first row.
  const current =
    nodeRows.find((r) => r.node.path === focused) ??
    nodeRows.find((r) => r.node.path === tree.selected) ??
    nodeRows[0];

  useEffect(() => {
    // Move DOM focus only when the tree already has it, so loading never steals focus.
    if (!current || renaming !== null || !listRef.current?.contains(document.activeElement)) {
      return;
    }
    itemRefs.current.get(current.node.path)?.focus();
  }, [current, renaming]);

  /** Creates something, then lets the user name it straight away. */
  async function createThenRename(created: Promise<string | null>): Promise<void> {
    const path = await created;
    if (path !== null) {
      setFocused(path);
      setRenaming(path);
    }
  }

  function activate(row: NodeRow): void {
    setFocused(row.node.path);
    selectEntry(row.node.path);
    if (row.node.isDir) void toggleFolder(row.node.path);
    else if (row.node.kind === 'page') void openPage(row.node.path);
  }

  function openMenuAt(node: NotebookNode | null, x: number, y: number): void {
    if (node) {
      setFocused(node.path);
      selectEntry(node.path);
    }
    setMenu({ node, x, y });
  }

  function menuItems(node: NotebookNode | null): MenuItem[] {
    if (node === null) {
      return [{ label: 'New notebook', onSelect: () => void createThenRename(createNotebook()) }];
    }
    const common: MenuItem[] = [
      {
        label: 'Rename',
        onSelect: () => {
          setRenaming(node.path);
        },
      },
      {
        label: 'Move to Recycle Bin',
        danger: true,
        onSelect: () => {
          setConfirming(node);
        },
      },
    ];
    if (!node.isDir) {
      if (node.kind !== 'page') return common;
      return [
        ...common.slice(0, -1),
        { label: 'Save as template', onSelect: () => void saveAsTemplate(node.path) },
        ...common.slice(-1),
      ];
    }
    return [
      { label: 'New page', onSelect: () => void createThenRename(createPage(node.path)) },
      {
        label: 'New page from template…',
        onSelect: () => {
          setTemplateFolder(node.path);
        },
      },
      { label: 'New section', onSelect: () => void createThenRename(createSection(node.path)) },
      ...common,
    ];
  }

  function colourSwatches(node: NotebookNode) {
    return (
      <div className="menu-colours" role="group" aria-label="Colour">
        {SECTION_COLOURS.map((colour) => (
          <button
            key={colour}
            type="button"
            role="menuitem"
            className="swatch"
            aria-label={`Colour ${colour}`}
            aria-pressed={node.colour === colour}
            style={{ background: colourValue(colour) }}
            onClick={() => {
              setMenu(null);
              void setFolderColour(node.path, colour);
            }}
          />
        ))}
        <button
          type="button"
          role="menuitem"
          className="swatch none"
          aria-label="No colour"
          onClick={() => {
            setMenu(null);
            void setFolderColour(node.path, null);
          }}
        />
      </div>
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>): void {
    if (event.target instanceof HTMLInputElement || !current) return;
    const index = nodeRows.indexOf(current);
    const move = (i: number) => {
      const target = nodeRows[Math.max(0, Math.min(nodeRows.length - 1, i))];
      if (target) setFocused(target.node.path);
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
        move(nodeRows.length - 1);
        break;
      case 'ArrowRight':
        if (!current.node.isDir) return;
        if (!current.expanded) void toggleFolder(current.node.path);
        else if ((nodeRows[index + 1]?.depth ?? 0) > current.depth) move(index + 1);
        break;
      case 'ArrowLeft':
        if (current.node.isDir && current.expanded) {
          void toggleFolder(current.node.path);
        } else {
          const parent = parentVaultPath(current.node.path);
          if (parent) setFocused(parent);
        }
        break;
      case 'Enter':
      case ' ':
        activate(current);
        break;
      case 'F2':
        setRenaming(current.node.path);
        break;
      case 'Delete':
        setConfirming(current.node);
        break;
      case 'ContextMenu':
      case 'F10': {
        if (event.key === 'F10' && !event.shiftKey) return;
        const rect = itemRefs.current.get(current.node.path)?.getBoundingClientRect();
        openMenuAt(current.node, rect?.left ?? 0, rect?.bottom ?? 0);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  }

  // ---- Drag and drop ----

  function placeFor(row: NodeRow, event: DragEvent): DropPlace {
    const rect = event.currentTarget.getBoundingClientRect();
    const y = (event.clientY - rect.top) / Math.max(1, rect.height);
    if (row.node.isDir) return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'into';
    return y < 0.5 ? 'before' : 'after';
  }

  function canDrop(source: string, row: NodeRow, place: DropPlace): boolean {
    const target = place === 'into' ? row.node.path : (parentVaultPath(row.node.path) ?? '');
    return source !== row.node.path && target !== source && !target.startsWith(`${source}/`);
  }

  function onDragOver(row: NodeRow, event: DragEvent<HTMLLIElement>): void {
    const source = dragging.current;
    if (source === null) return;
    const place = placeFor(row, event);
    if (!canDrop(source, row, place)) {
      setDrop(null);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    setDrop({ path: row.node.path, place });
  }

  function onDrop(row: NodeRow, event: DragEvent<HTMLLIElement>): void {
    const source = dragging.current ?? event.dataTransfer.getData(DRAG_TYPE);
    event.preventDefault();
    event.stopPropagation();
    endDrag();
    if (!source) return;
    const place = placeFor(row, event);
    if (!canDrop(source, row, place)) return;
    if (place === 'into') {
      void moveItem(source, row.node.path);
      return;
    }
    const folder = parentVaultPath(row.node.path) ?? '';
    const sourceName = source.slice(source.lastIndexOf('/') + 1);
    const siblings = (folderNodes(tree, folder, 0, options) ?? [])
      .map((n) => n.name)
      .filter((n) => n !== sourceName);
    const index = siblings.indexOf(row.node.name) + (place === 'after' ? 1 : 0);
    void moveItem(source, folder, index);
  }

  function endDrag(): void {
    dragging.current = null;
    setDrop(null);
  }

  return (
    <>
      {templateFolder !== null && (
        <TemplatePicker
          mode="new"
          onClose={() => {
            setTemplateFolder(null);
          }}
          onChoose={(template, title) => {
            const folder = templateFolder;
            setTemplateFolder(null);
            void createFromTemplate(folder, template, title);
          }}
        />
      )}
      {confirming !== null && (
        <ConfirmRecycle
          node={confirming}
          onCancel={() => {
            setConfirming(null);
          }}
          onConfirm={() => {
            const node = confirming;
            setConfirming(null);
            void recycleItem(node.path);
          }}
        />
      )}
      <ul
        className="file-tree notebook-tree"
        role="tree"
        aria-label="Notebooks"
        ref={listRef}
        onKeyDown={onKeyDown}
        onContextMenu={(e: MouseEvent) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            openMenuAt(null, e.clientX, e.clientY);
          }
        }}
        onDragOver={(e) => {
          // Dropping on empty space moves the item to the top level.
          if (dragging.current !== null && e.target === e.currentTarget) {
            e.preventDefault();
            setDrop(null);
          }
        }}
        onDrop={(e) => {
          const source = dragging.current;
          endDrag();
          if (source !== null && e.target === e.currentTarget) {
            e.preventDefault();
            void moveItem(source, '');
          }
        }}
      >
        {rows.map((row) => {
          if (row.kind !== 'node') {
            return (
              <StatusRow
                key={`${row.kind}:${row.parent}`}
                row={row}
                onNewNotebook={() => void createThenRename(createNotebook())}
              />
            );
          }
          const { node } = row;
          const isRenaming = renaming === node.path;
          const dropClass = drop?.path === node.path ? ` drop-${drop.place}` : '';
          return (
            <li
              key={node.path}
              ref={(el) => {
                if (el) itemRefs.current.set(node.path, el);
                else itemRefs.current.delete(node.path);
              }}
              role="treeitem"
              aria-level={row.depth + 1}
              aria-selected={tree.selected === node.path}
              aria-expanded={node.isDir ? row.expanded : undefined}
              aria-label={node.title}
              aria-roledescription={KIND_LABEL[node.kind]}
              tabIndex={node.path === current?.node.path ? 0 : -1}
              className={`tree-item ${node.kind}${dropClass}`}
              style={{ paddingLeft: 8 + row.depth * INDENT_PX }}
              title={node.path}
              draggable={!isRenaming}
              onClick={() => {
                if (!isRenaming) activate(row);
              }}
              onFocus={() => {
                setFocused(node.path);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                openMenuAt(node, e.clientX, e.clientY);
              }}
              onDragStart={(e) => {
                dragging.current = node.path;
                e.dataTransfer.setData(DRAG_TYPE, node.path);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                onDragOver(row, e);
              }}
              onDragLeave={() => {
                setDrop((d) => (d?.path === node.path ? null : d));
              }}
              onDrop={(e) => {
                onDrop(row, e);
              }}
              onDragEnd={endDrag}
            >
              <span className="twisty" aria-hidden="true">
                {node.isDir ? (row.expanded ? '▾' : '▸') : ''}
              </span>
              {node.colour !== null && (
                <span
                  className={`colour-mark ${node.kind}`}
                  aria-hidden="true"
                  style={{ background: colourValue(node.colour) }}
                />
              )}
              {isRenaming ? (
                <RenameField
                  initial={node.title}
                  onDone={(value) => {
                    setRenaming(null);
                    if (value === null || value.trim() === '' || value === node.title) return;
                    void renameItem(node.path, value).then((path) => {
                      if (path !== null) setFocused(path);
                    });
                  }}
                />
              ) : (
                <span className="tree-label">{node.title}</span>
              )}
              {!isRenaming && (
                <button
                  type="button"
                  className="row-menu"
                  tabIndex={-1}
                  aria-label={`More for ${node.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    openMenuAt(node, rect.left, rect.bottom);
                  }}
                >
                  …
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {menu !== null && (
        <Menu
          label={menu.node ? `${menu.node.title} options` : 'Vault options'}
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.node)}
          footer={menu.node?.isDir ? colourSwatches(menu.node) : undefined}
          onClose={() => {
            setMenu(null);
            listRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

function RenameField({
  initial,
  onDone,
}: {
  initial: string;
  /** The new name, or null if cancelled. */
  onDone: (value: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (result: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(result);
  };
  return (
    <input
      className="rename-field"
      aria-label="Name"
      value={value}
      autoFocus
      onFocus={(e) => {
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setValue(e.target.value);
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(value);
        else if (e.key === 'Escape') finish(null);
        e.stopPropagation();
      }}
      onBlur={() => {
        finish(value);
      }}
    />
  );
}

function ConfirmRecycle({
  node,
  onConfirm,
  onCancel,
}: {
  node: NotebookNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="confirm sidebar-confirm" role="alertdialog" aria-labelledby="recycle-text">
      <p id="recycle-text">
        Move “{node.title}”{node.isDir ? ' and everything in it' : ''} to the Recycle Bin?
      </p>
      <div className="actions">
        <button type="button" autoFocus onClick={onConfirm}>
          Move to Recycle Bin
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function StatusRow({
  row,
  onNewNotebook,
}: {
  row: Exclude<NotebookRow, NodeRow>;
  onNewNotebook: () => void;
}) {
  if (row.kind === 'empty' && row.parent === '') {
    return (
      <li role="none" className="tree-status empty-vault">
        <span>This vault is empty.</span>
        <button type="button" onClick={onNewNotebook}>
          New notebook
        </button>
      </li>
    );
  }
  const text = row.kind === 'loading' ? 'Loading…' : row.kind === 'error' ? row.message : 'Empty';
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
