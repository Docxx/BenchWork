import { PanelLeftOpen } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { OpenVault } from '../vault/vaultService';
import { useApp } from './AppStoreContext';
import { AttachDialog } from './AttachDialog';
import { CommandList, TextPromptDialog } from './ModuleDialogs';
import { PageView } from './PageView';
import { SettingsPage } from './SettingsPage';
import { SidePanel } from './SidePanel';
import { Sidebar } from './Sidebar';

/** The sidebar, and the main area: Settings when open, otherwise the open page. */
export function Shell({ vault }: { vault: OpenVault }) {
  const view = useApp((s) => s.view);
  const page = useApp((s) => s.page);
  const moduleView = useApp((s) => s.moduleView);
  const sidePanel = useApp((s) => s.settings.appearance.sidePanel);
  const focusSearch = useApp((s) => s.focusSearch);
  const openToday = useApp((s) => s.openToday);
  const [showCommands, setShowCommands] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
      {sidebarOpen ? (
        <Sidebar
          vault={vault}
          onCollapse={() => {
            setSidebarOpen(false);
          }}
          onCommands={() => {
            setShowCommands(true);
          }}
        />
      ) : (
        <button
          type="button"
          className="icon-button sidebar-reveal"
          title="Show the sidebar"
          aria-label="Show the sidebar"
          onClick={() => {
            setSidebarOpen(true);
          }}
        >
          <PanelLeftOpen size={17} strokeWidth={1.75} aria-hidden />
        </button>
      )}
      <main className="shell-main">
        {view === 'settings' ? <SettingsPage vault={vault} /> : <PageView />}
      </main>
      {sidePanel && view === 'files' && page !== null && moduleView === null && (
        // Keyed by page, so each page starts on its outline.
        <SidePanel key={page.path} page={page} />
      )}
      {showCommands && <CommandList onClose={closeCommands} />}
      <TextPromptDialog />
      <AttachDialog />
    </div>
  );
}
