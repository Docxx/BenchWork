import { useEffect } from 'react';
import { useApp } from './AppStoreContext';
import { Shell } from './Shell';
import { applyTheme } from './theme';
import { ConfirmFolder, ConfirmNested, VaultPicker } from './VaultPicker';

export function App() {
  const status = useApp((s) => s.status);
  const theme = useApp((s) => s.settings.theme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  switch (status.kind) {
    case 'starting':
      return <main className="app" aria-busy="true" />;
    case 'no-vault':
      return <VaultPicker />;
    case 'confirm-folder':
      return <ConfirmFolder root={status.root} />;
    case 'confirm-nested':
      return <ConfirmNested folder={status.folder} owner={status.owner} />;
    case 'open':
      return <Shell vault={status.vault} />;
  }
}
