import type { OpenVault } from '../vault/vaultService';
import { Sidebar } from './Sidebar';

// The main area stays empty until pages open in Phase 1.
export function Shell({ vault }: { vault: OpenVault }) {
  return (
    <div className="shell">
      <Sidebar vault={vault} />
      <main className="shell-main" />
    </div>
  );
}
