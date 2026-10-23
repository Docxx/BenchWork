import { useState } from 'react';
import type { OpenVault } from '../vault/vaultService';
import { useApp } from './AppStoreContext';
import { Menu } from './Menu';
import { ModulePanels } from './ModulePanels';
import { NotebookTree } from './NotebookTree';
import { SearchBox, SearchResults } from './SearchPanel';

/** Name shown for a vault: the last part of its folder path. */
export function vaultName(root: string): string {
  const parts = root.split(/[\\/]/).filter((p) => p !== '');
  return parts.at(-1) ?? root;
}

export function Sidebar({ vault }: { vault: OpenVault }) {
  const refreshTree = useApp((s) => s.refreshTree);
  const closeVault = useApp((s) => s.closeVault);
  const view = useApp((s) => s.view);
  const showView = useApp((s) => s.showView);
  const createNotebook = useApp((s) => s.createNotebook);
  const setRenaming = useApp((s) => s.setRenaming);
  const notice = useApp((s) => s.sidebarNotice);
  const dismissNotice = useApp((s) => s.dismissSidebarNotice);
  const results = useApp((s) => s.searchResults);
  const openToday = useApp((s) => s.openToday);
  const newCommands = useApp((s) => s.commands).filter((c) => c.places?.includes('new'));
  const runCommand = useApp((s) => s.runCommand);
  const [newMenu, setNewMenu] = useState<{ x: number; y: number } | null>(null);

  const newNotebook = () => {
    void createNotebook().then((path) => {
      if (path !== null) setRenaming(path);
    });
  };

  return (
    <nav className="sidebar" aria-label="Vault">
      <header className="sidebar-header">
        <h1 title={vault.root}>{vaultName(vault.root)}</h1>
        <div className="sidebar-tools">
          <button
            type="button"
            className="quiet today"
            title="Today's page (Ctrl+Shift+D)"
            onClick={() => void openToday()}
          >
            Today
          </button>
          <button
            type="button"
            className="quiet"
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
            +
          </button>
          <button
            type="button"
            className="quiet"
            title="Refresh"
            aria-label="Refresh"
            onClick={() => void refreshTree()}
          >
            ↻
          </button>
        </div>
      </header>
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
      {notice !== null && (
        <div className="notice sidebar-notice" role="alert">
          <span>{notice}</span>
          <button type="button" className="quiet" aria-label="Dismiss" onClick={dismissNotice}>
            ×
          </button>
        </div>
      )}
      <SearchBox />
      <div className="sidebar-body">
        {results === null ? <NotebookTree /> : <SearchResults results={results} />}
      </div>
      <ModulePanels />
      <footer className="sidebar-footer">
        <button
          type="button"
          className="quiet"
          aria-pressed={view === 'settings'}
          onClick={() => {
            showView(view === 'settings' ? 'files' : 'settings');
          }}
        >
          Settings
        </button>
        <button type="button" className="quiet" onClick={() => void closeVault()}>
          Switch vault
        </button>
      </footer>
    </nav>
  );
}
