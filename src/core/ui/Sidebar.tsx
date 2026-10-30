import {
  ArrowLeftRight,
  CalendarDays,
  Columns2,
  House,
  PanelLeftClose,
  Plus,
  RotateCw,
  Settings,
  SquareTerminal,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { OpenVault } from '../vault/vaultService';
import { useApp } from './AppStoreContext';
import { dockContents } from '../settings/layout';
import { Dock, DockSplitter } from './Dock';
import { Logo } from './Logo';
import { Menu } from './Menu';
import { ModulePanels } from './ModulePanels';
import { NotebookTree } from './NotebookTree';
import { SearchBox, SearchResults } from './SearchPanel';
import { useHomeLayout, useWidgets } from './widgets';

/** Name shown for a vault: the last part of its folder path. */
export function vaultName(root: string): string {
  const parts = root.split(/[\\/]/).filter((p) => p !== '');
  return parts.at(-1) ?? root;
}

/** Up to two letters for a name, for its badge. */
export function initials(name: string): string {
  const words = name.split(/[\s_-]+/).filter((w) => w !== '');
  const letters =
    words.length > 1 ? (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '') : name.slice(0, 2);
  return letters.toUpperCase();
}

const ICON = { size: 17, strokeWidth: 1.75, 'aria-hidden': true } as const;

export function Sidebar({
  vault,
  onCollapse,
  onCommands,
}: {
  vault: OpenVault;
  onCollapse: () => void;
  onCommands: () => void;
}) {
  const refreshTree = useApp((s) => s.refreshTree);
  const closeVault = useApp((s) => s.closeVault);
  const view = useApp((s) => s.view);
  const showView = useApp((s) => s.showView);
  const conflicts = useApp((s) => s.conflicts.length);
  const createNotebook = useApp((s) => s.createNotebook);
  const setRenaming = useApp((s) => s.setRenaming);
  const notice = useApp((s) => s.sidebarNotice);
  const dismissNotice = useApp((s) => s.dismissSidebarNotice);
  const results = useApp((s) => s.searchResults);
  const openToday = useApp((s) => s.openToday);
  const newCommands = useApp((s) => s.commands).filter((c) => c.places?.includes('new'));
  const runCommand = useApp((s) => s.runCommand);
  const tools = useApp((s) => s.pageViews).filter((v) => v.tool !== undefined);
  const moduleView = useApp((s) => s.moduleView);
  const openModuleView = useApp((s) => s.openModuleView);
  const atHome = useApp((s) => s.atHome());
  const goHome = useApp((s) => s.goHome);
  const [newMenu, setNewMenu] = useState<{ x: number; y: number } | null>(null);
  const name = vaultName(vault.root);

  const newNotebook = () => {
    void createNotebook().then((path) => {
      if (path !== null) setRenaming(path);
    });
  };

  return (
    <nav className="sidebar" aria-label="Vault">
      <header className="sidebar-header" data-tauri-drag-region>
        <Logo className="brand-mark" size={32} />
        <div className="brand-text">
          <span className="brand-name">BenchWork</span>
          <h1 className="vault-name" title={vault.root}>
            {name}
          </h1>
        </div>
        <button
          type="button"
          className="icon-button"
          title="Hide the sidebar"
          aria-label="Hide the sidebar"
          onClick={onCollapse}
        >
          <PanelLeftClose {...ICON} />
        </button>
      </header>

      {notice !== null && (
        <div className="notice sidebar-notice" role="alert">
          <span>{notice}</span>
          <button type="button" className="quiet" aria-label="Dismiss" onClick={dismissNotice}>
            ×
          </button>
        </div>
      )}

      <SearchBox />

      <ul className="sidebar-nav">
        <li>
          <button
            type="button"
            className="nav-item"
            aria-pressed={atHome}
            onClick={() => void goHome()}
          >
            <House {...ICON} />
            Home
          </button>
        </li>
        <li>
          <button
            type="button"
            className="nav-item"
            title="Today's page (Ctrl+Shift+D)"
            onClick={() => void openToday()}
          >
            <CalendarDays {...ICON} />
            Today
          </button>
        </li>
        <li>
          <button type="button" className="nav-item" title="Commands (Ctrl+K)" onClick={onCommands}>
            <SquareTerminal {...ICON} />
            Commands
            <kbd>Ctrl K</kbd>
          </button>
        </li>
        {tools.length > 0 && (
          <li className="nav-group" aria-label="Tools">
            <span className="nav-group-name">Tools</span>
            <ul>
              {tools.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className="nav-item"
                    title={v.tool?.hint}
                    aria-pressed={moduleView?.id === v.id}
                    onClick={() => void openModuleView(v.id)}
                  >
                    {v.tool?.icon}
                    {v.title}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        )}
        {conflicts > 0 && (
          <li>
            <button
              type="button"
              className="nav-item differences"
              title="Pages changed on two devices before they synced"
              aria-pressed={view === 'conflicts'}
              onClick={() => {
                showView('conflicts');
              }}
            >
              <Columns2 {...ICON} />
              Differences
              <span className="nav-count">{conflicts}</span>
            </button>
          </li>
        )}
      </ul>

      <div className="sidebar-section-head">
        <span>{results === null ? 'Notebooks' : 'Search results'}</span>
        <button
          type="button"
          className="icon-button"
          title="Refresh"
          aria-label="Refresh"
          onClick={() => void refreshTree()}
        >
          <RotateCw size={14} strokeWidth={1.75} aria-hidden />
        </button>
        <button
          type="button"
          className="icon-button"
          title={newCommands.length === 0 ? 'New notebook' : 'New'}
          aria-label={newCommands.length === 0 ? 'New notebook' : 'New'}
          aria-haspopup={newCommands.length === 0 ? undefined : 'menu'}
          onClick={(e) => {
            // With modules adding things to make, + offers a choice.
            if (newCommands.length === 0) {
              newNotebook();
              return;
            }
            const rect = e.currentTarget.getBoundingClientRect();
            setNewMenu({ x: rect.left, y: rect.bottom });
          }}
        >
          <Plus size={15} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      {newMenu !== null && (
        <Menu
          label="New"
          x={newMenu.x}
          y={newMenu.y}
          items={[
            { label: 'New notebook', onSelect: newNotebook },
            ...newCommands.map((c) => ({
              label: c.title,
              onSelect: () => void runCommand(c.id, { folder: null }),
            })),
          ]}
          onClose={() => {
            setNewMenu(null);
          }}
        />
      )}

      <div className="sidebar-body">
        {results === null ? <NotebookTree /> : <SearchResults results={results} />}
      </div>
      <ModulePanels />
      <LeftDock />

      <footer className="sidebar-footer">
        <span className="vault-badge" aria-hidden="true">
          {initials(name)}
        </span>
        <div className="vault-card">
          <span className="vault-card-name">{name}</span>
          <span className="vault-card-detail">Local vault</span>
        </div>
        <button
          type="button"
          className="icon-button"
          title="Settings"
          aria-label="Settings"
          aria-pressed={view === 'settings'}
          onClick={() => {
            showView(view === 'settings' ? 'files' : 'settings');
          }}
        >
          <Settings {...ICON} />
        </button>
        <button
          type="button"
          className="icon-button"
          title="Switch vault"
          aria-label="Switch vault"
          onClick={() => void closeVault()}
        >
          <ArrowLeftRight {...ICON} />
        </button>
      </footer>
    </nav>
  );
}

/** Widgets under the notebooks, such as a calendar; just an add button while empty. */
function LeftDock() {
  const widgets = useWidgets();
  const { docks } = useHomeLayout();
  const setDockSize = useApp((s) => s.setDockSize);
  const ids = dockContents(docks, widgets).left;
  const box = useRef<HTMLDivElement>(null);
  if (ids.length === 0) {
    return <Dock place="left" ids={ids} widgets={widgets} className="dock-left" />;
  }
  return (
    <>
      <DockSplitter
        label="Size of the widgets under the notebooks"
        onMove={(dy) => {
          box.current?.style.setProperty('height', `${String(docks.leftSize - dy)}px`);
        }}
        onDone={(dy) => void setDockSize({ leftSize: docks.leftSize - dy })}
      />
      <div ref={box} className="dock-left-box" style={{ height: `${String(docks.leftSize)}px` }}>
        <Dock place="left" ids={ids} widgets={widgets} className="dock-left" />
      </div>
    </>
  );
}
