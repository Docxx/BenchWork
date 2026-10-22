import type { OpenVault } from '../vault/vaultService';
import { useApp } from './AppStoreContext';
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

  return (
    <nav className="sidebar" aria-label="Vault">
      <header className="sidebar-header">
        <h1 title={vault.root}>{vaultName(vault.root)}</h1>
        <div className="sidebar-tools">
          <button
            type="button"
            className="quiet"
            title="New notebook"
            aria-label="New notebook"
            onClick={() => {
              void createNotebook().then((path) => {
                if (path !== null) setRenaming(path);
              });
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
