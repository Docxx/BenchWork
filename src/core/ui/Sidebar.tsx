import type { OpenVault } from '../vault/vaultService';
import { useApp } from './AppStoreContext';
import { FileTree } from './FileTree';

/** Name shown for a vault: the last part of its folder path. */
export function vaultName(root: string): string {
  const parts = root.split(/[\\/]/).filter((p) => p !== '');
  return parts.at(-1) ?? root;
}

export function Sidebar({ vault }: { vault: OpenVault }) {
  const refreshTree = useApp((s) => s.refreshTree);
  const closeVault = useApp((s) => s.closeVault);

  return (
    <nav className="sidebar" aria-label="Vault">
      <header className="sidebar-header">
        <h1 title={vault.root}>{vaultName(vault.root)}</h1>
        <button
          type="button"
          className="quiet"
          title="Refresh"
          aria-label="Refresh"
          onClick={() => void refreshTree()}
        >
          ↻
        </button>
      </header>
      <div className="sidebar-body">
        <FileTree />
      </div>
      <footer className="sidebar-footer">
        <button type="button" className="quiet" onClick={() => void closeVault()}>
          Switch vault
        </button>
      </footer>
    </nav>
  );
}
