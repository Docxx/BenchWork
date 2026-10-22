import type { OpenVault } from '../vault/vaultService';
import { useApp } from './AppStoreContext';

/** Name shown for a vault: the last part of its folder path. */
export function vaultName(root: string): string {
  const parts = root.split(/[\\/]/).filter((p) => p !== '');
  return parts.at(-1) ?? root;
}

// Placeholder layout. The file tree sidebar and Settings arrive in later Phase 0 steps.
export function Shell({ vault }: { vault: OpenVault }) {
  const closeVault = useApp((s) => s.closeVault);

  return (
    <div className="shell">
      <header className="shell-header">
        <h1 title={vault.root}>{vaultName(vault.root)}</h1>
        <button type="button" onClick={closeVault}>
          Switch vault
        </button>
      </header>
      <main className="shell-main" />
    </div>
  );
}
