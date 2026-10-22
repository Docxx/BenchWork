import type { OpenVault } from '../vault/vaultService';
import { useApp } from './AppStoreContext';
import { PageView } from './PageView';
import { SettingsPage } from './SettingsPage';
import { Sidebar } from './Sidebar';

/** The sidebar, and the main area: Settings when open, otherwise the open page. */
export function Shell({ vault }: { vault: OpenVault }) {
  const view = useApp((s) => s.view);

  return (
    <div className="shell">
      <Sidebar vault={vault} />
      <main className="shell-main">
        {view === 'settings' ? <SettingsPage vault={vault} /> : <PageView />}
      </main>
    </div>
  );
}
