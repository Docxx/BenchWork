import type { OpenVault } from '../vault/vaultService';
import { useApp } from './AppStoreContext';
import { SettingsPage } from './SettingsPage';
import { Sidebar } from './Sidebar';

// The main area shows Settings when open; pages arrive in Phase 1.
export function Shell({ vault }: { vault: OpenVault }) {
  const view = useApp((s) => s.view);

  return (
    <div className="shell">
      <Sidebar vault={vault} />
      <main className="shell-main">{view === 'settings' && <SettingsPage vault={vault} />}</main>
    </div>
  );
}
