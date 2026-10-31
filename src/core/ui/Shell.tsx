import { PanelLeftOpen } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PANEL_WIDTH, SIDEBAR_WIDTH } from '../settings/appearance';
import type { OpenVault } from '../vault/vaultService';
import { useApp, useAppStore } from './AppStoreContext';
import { AttachDialog } from './AttachDialog';
import { ConflictsView } from './ConflictsView';
import { FirstRunGuide } from './FirstRunGuide';
import { CommandList, TextPromptDialog } from './ModuleDialogs';
import { PackChooser } from './PackChooser';
import { PageView } from './PageView';
import { QuickCapture } from './QuickCapture';
import { ResizeEdge } from './ResizeEdge';
import { SettingsPage } from './SettingsPage';
import { SidePanel } from './SidePanel';
import { Sidebar } from './Sidebar';
import { WindowControls } from './WindowControls';

/** Narrower than this, the sidebar and side panel slide over the page. */
const COMPACT_QUERY = '(max-width: 960px)';

/** The sidebar, and the main area: Settings when open, otherwise the open page. */
export function Shell({ vault }: { vault: OpenVault }) {
  const view = useApp((s) => s.view);
  const page = useApp((s) => s.page);
  const moduleView = useApp((s) => s.moduleView);
  const sidePanel = useApp((s) => s.settings.appearance.sidePanel);
  const sidebarWidth = useApp((s) => s.settings.appearance.sidebarWidth);
  const panelWidth = useApp((s) => s.settings.appearance.panelWidth);
  const setAppearance = useApp((s) => s.setAppearance);
  const focusSearch = useApp((s) => s.focusSearch);
  const openToday = useApp((s) => s.openToday);
  const store = useAppStore();
  const choosingPack = useApp((s) => s.choosingPack);
  const guide = useApp((s) => s.guide);
  const framed = useApp((s) => s.windowFrame !== null);
  const [showCommands, setShowCommands] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const closeCommands = useCallback(() => {
    setShowCommands(false);
  }, []);

  // Ctrl+E searches, as in OneNote; Ctrl+Shift+D opens today's page; Ctrl+K lists commands.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && store.getState().drawer !== null) {
        store.getState().setDrawer(null);
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (!e.shiftKey && key === 'e') {
        e.preventDefault();
        if (store.getState().compact) store.getState().setDrawer('sidebar');
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
  }, [focusSearch, openToday, store]);

  // A narrow window, such as a tablet held upright, is compact.
  const setCompact = useApp((s) => s.setCompact);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(COMPACT_QUERY);
    setCompact(query.matches);
    const onChange = (e: MediaQueryListEvent) => {
      setCompact(e.matches);
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, [setCompact]);

  // Sidebar and side panel slide over the page on a narrow screen.
  const compact = useApp((s) => s.compact);
  const drawer = useApp((s) => s.drawer);
  const setDrawer = useApp((s) => s.setDrawer);
  const showSidebar = compact ? drawer === 'sidebar' : sidebarOpen;
  const showPanel = compact ? drawer === 'panel' : sidePanel;

  // Choosing a page, a view or Settings puts away whatever slid over the page.
  const pagePath = page?.path ?? null;
  const openFile = useApp((s) => s.openFile);
  useEffect(() => {
    setDrawer(null);
  }, [pagePath, openFile, view, moduleView, setDrawer]);

  return (
    <div className={['shell', compact ? 'compact' : '', framed ? 'framed' : ''].join(' ').trim()}>
      <WindowControls />
      {compact && drawer !== null && (
        <button
          type="button"
          className="drawer-scrim"
          aria-label={drawer === 'sidebar' ? 'Hide the sidebar' : 'Hide the side panel'}
          onClick={() => {
            setDrawer(null);
          }}
        />
      )}
      {showSidebar ? (
        <>
          <Sidebar
            vault={vault}
            onCollapse={() => {
              if (compact) setDrawer(null);
              else setSidebarOpen(false);
            }}
            onCommands={() => {
              setShowCommands(true);
            }}
          />
          {!compact && (
            <ResizeEdge
              label="Sidebar width"
              grows="right"
              width={sidebarWidth}
              range={SIDEBAR_WIDTH}
              token="--sidebar-width"
              onChange={(w) => void setAppearance({ sidebarWidth: w })}
            />
          )}
        </>
      ) : (
        <button
          type="button"
          className="icon-button sidebar-reveal"
          title="Show the sidebar"
          aria-label="Show the sidebar"
          onClick={() => {
            if (compact) setDrawer('sidebar');
            else setSidebarOpen(true);
          }}
        >
          <PanelLeftOpen size={17} strokeWidth={1.75} aria-hidden />
        </button>
      )}
      <main className="shell-main">
        {view === 'settings' ? (
          <SettingsPage vault={vault} />
        ) : view === 'conflicts' ? (
          <ConflictsView />
        ) : (
          <PageView />
        )}
      </main>
      {showPanel && view === 'files' && (
        <>
          {!compact && (
            <ResizeEdge
              label="Side panel width"
              grows="left"
              width={panelWidth}
              range={PANEL_WIDTH}
              token="--panel-width"
              onChange={(w) => void setAppearance({ panelWidth: w })}
            />
          )}
          <SidePanel />
        </>
      )}
      {showCommands && <CommandList onClose={closeCommands} />}
      <QuickCapture />
      {guide !== null ? <FirstRunGuide /> : choosingPack && <PackChooser />}
      <TextPromptDialog />
      <AttachDialog />
    </div>
  );
}
