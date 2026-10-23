import { useCallback, useEffect, useState } from 'react';
import type { OpenVault } from '../vault/vaultService';
import { useApp } from './AppStoreContext';
import { CommandList, TextPromptDialog } from './ModuleDialogs';
import { PageView } from './PageView';
import { SettingsPage } from './SettingsPage';
import { Sidebar } from './Sidebar';

/** The sidebar, and the main area: Settings when open, otherwise the open page. */
export function Shell({ vault }: { vault: OpenVault }) {
  const view = useApp((s) => s.view);
  const focusSearch = useApp((s) => s.focusSearch);
  const openToday = useApp((s) => s.openToday);
  const [showCommands, setShowCommands] = useState(false);
  const closeCommands = useCallback(() => {
    setShowCommands(false);
  }, []);

  // Ctrl+E searches, as in OneNote; Ctrl+Shift+D opens today's page; Ctrl+K lists commands.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (!e.shiftKey && key === 'e') {
        e.preventDefault();
        focusSearch();
      } else if (e.shiftKey && key === 'd') {
        e.preventDefault();
        void openToday();
      } else if (!e.shiftKey && key === 'k') {
        e.preventDefault();
        setShowCommands(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [focusSearch, openToday]);

  return (
    <div className="shell">
      <Sidebar vault={vault} />
      <main className="shell-main">
        {view === 'settings' ? <SettingsPage vault={vault} /> : <PageView />}
      </main>
      {showCommands && <CommandList onClose={closeCommands} />}
      <TextPromptDialog />
    </div>
  );
}
