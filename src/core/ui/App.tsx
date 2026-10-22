import { useApp } from './AppStoreContext';
import { ConfirmFolder, VaultPicker } from './VaultPicker';
import { Shell } from './Shell';

export function App() {
  const status = useApp((s) => s.status);

  switch (status.kind) {
    case 'starting':
      return <main className="app" aria-busy="true" />;
    case 'no-vault':
      return <VaultPicker />;
    case 'confirm-folder':
      return <ConfirmFolder root={status.root} />;
    case 'open':
      return <Shell vault={status.vault} />;
  }
}
