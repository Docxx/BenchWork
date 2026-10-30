import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Clock,
  EyeOff,
  LayoutGrid,
  NotebookPen,
  Pin,
  Plus,
  Search,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { pageTitle } from '../notebooks/notebookTree';
import type { PageRef } from '../platform';
import { defaultHomeLayout, type HomeLayout } from '../settings/appSettings';
import { BUILT_IN_CARDS, moveCard, orderCards } from '../state/homeSlice';
import { useApp } from './AppStoreContext';
import { ViewBoundary } from './ModuleView';
import { useQuickNote } from './QuickCapture';
import { vaultName } from './Sidebar';
import { updatedText } from './updated';

const ICON = { size: 17, strokeWidth: 1.75, 'aria-hidden': true } as const;

/** How many recent pages Home lists. */
const RECENT = 8;

interface Card {
  id: string;
  title: string;
  icon: ReactNode;
  wide: boolean;
  moduleId: string | null;
  render: () => ReactNode;
}

const NO_LAYOUT = defaultHomeLayout();

/** The open vault's Home layout, the same object until it changes. */
export function useHomeLayout(): HomeLayout {
  return useApp((s) =>
    s.status.kind === 'open' ? (s.settings.home[s.status.vault.root] ?? NO_LAYOUT) : NO_LAYOUT,
  );
}

/** "Good morning" and so on, by the hour. */
export function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Home: what BenchWork shows when nothing else is open. Cards come from the
 * app and from modules; they can be moved and hidden, per vault, on this device.
 */
export function HomeView() {
  const status = useApp((s) => s.status);
  const homeCards = useApp((s) => s.homeCards);
  const layout = useHomeLayout();
  const setLayout = useApp((s) => s.setHomeLayout);
  const [editing, setEditing] = useState(false);
  const now = new Date();

  const builtIn: Card[] = [
    {
      id: 'home.today',
      title: 'Today',
      icon: <CalendarDays {...ICON} />,
      wide: false,
      moduleId: null,
      render: () => <TodayCard />,
    },
    {
      id: 'home.tools',
      title: 'Tools',
      icon: <LayoutGrid {...ICON} />,
      wide: false,
      moduleId: null,
      render: () => <ToolsCard />,
    },
    {
      id: 'home.pinned',
      title: 'Pinned',
      icon: <Pin {...ICON} />,
      wide: false,
      moduleId: null,
      render: () => <PinnedCard />,
    },
    {
      id: 'home.recent',
      title: 'Recent pages',
      icon: <Clock {...ICON} />,
      wide: false,
      moduleId: null,
      render: () => <RecentCard />,
    },
  ];
  const fromModules: Card[] = homeCards.map((c) => ({
    id: c.id,
    title: c.title,
    icon: c.icon ?? null,
    wide: c.wide === true,
    moduleId: c.moduleId,
    render: c.render,
  }));
  const byId = new Map([...builtIn, ...fromModules].map((c) => [c.id, c]));
  const order = orderCards([...BUILT_IN_CARDS, ...fromModules.map((c) => c.id)], layout);
  const shown = order.filter((id) => !layout.hidden.includes(id));
  const hidden = order.filter((id) => layout.hidden.includes(id));

  const move = (id: string, by: -1 | 1) => {
    // Moves past hidden cards, so each press visibly moves the card.
    const next = moveCard(shown, id, by);
    void setLayout({ order: [...next, ...hidden] });
  };

  return (
    <article className="home" aria-label="Home">
      <header className="home-header" data-tauri-drag-region>
        <div>
          <h1>{greeting(now)}</h1>
          <p className="home-date">
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            {status.kind === 'open' && <span> · {vaultName(status.vault.root)}</span>}
          </p>
        </div>
        <button
          type="button"
          className="quiet"
          aria-pressed={editing}
          onClick={() => {
            setEditing((e) => !e);
          }}
        >
          {editing ? 'Done' : 'Edit home'}
        </button>
      </header>

      {editing && hidden.length > 0 && (
        <div className="home-hidden" aria-label="Hidden cards">
          <span>Hidden:</span>
          {hidden.map((id) => (
            <button
              key={id}
              type="button"
              className="chip"
              onClick={() => void setLayout({ hidden: layout.hidden.filter((h) => h !== id) })}
            >
              <Plus size={14} strokeWidth={2} aria-hidden />
              {byId.get(id)?.title ?? id}
            </button>
          ))}
        </div>
      )}

      <div className="home-grid">
        {shown.map((id, i) => {
          const card = byId.get(id);
          if (!card) return null;
          const headingId = `home-card-${id.replace(/[^a-z0-9]/gi, '-')}`;
          return (
            <section
              key={id}
              className={card.wide ? 'home-card wide' : 'home-card'}
              aria-labelledby={headingId}
            >
              <header className="home-card-head">
                {card.icon}
                <h2 id={headingId}>{card.title}</h2>
                {editing && (
                  <span className="home-card-tools">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Move ${card.title} up`}
                      title="Move up"
                      disabled={i === 0}
                      onClick={() => {
                        move(id, -1);
                      }}
                    >
                      <ArrowUp size={15} strokeWidth={1.75} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Move ${card.title} down`}
                      title="Move down"
                      disabled={i === shown.length - 1}
                      onClick={() => {
                        move(id, 1);
                      }}
                    >
                      <ArrowDown size={15} strokeWidth={1.75} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Hide ${card.title}`}
                      title="Hide"
                      onClick={() => void setLayout({ hidden: [...layout.hidden, id] })}
                    >
                      <EyeOff size={15} strokeWidth={1.75} aria-hidden />
                    </button>
                  </span>
                )}
              </header>
              <div className="home-card-body">
                {card.moduleId === null ? (
                  card.render()
                ) : (
                  <ViewBoundary moduleId={card.moduleId}>{card.render()}</ViewBoundary>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {shown.length === 0 && (
        <p className="hint">Every card is hidden. Choose Edit home to show some again.</p>
      )}
    </article>
  );
}

function TodayCard() {
  const openToday = useApp((s) => s.openToday);
  const focusSearch = useApp((s) => s.focusSearch);
  const compact = useApp((s) => s.compact);
  const setDrawer = useApp((s) => s.setDrawer);
  const quickNote = useQuickNote();
  return (
    <div className="home-actions">
      <button type="button" className="home-action" onClick={() => void openToday()}>
        <CalendarDays {...ICON} />
        Today’s page
      </button>
      <button type="button" className="home-action" onClick={() => void quickNote()}>
        <NotebookPen {...ICON} />
        Quick note
      </button>
      <button
        type="button"
        className="home-action"
        onClick={() => {
          if (compact) setDrawer('sidebar');
          focusSearch();
        }}
      >
        <Search {...ICON} />
        Search
      </button>
    </div>
  );
}

function ToolsCard() {
  const tools = useApp((s) => s.pageViews).filter((v) => v.tool !== undefined);
  const openView = useApp((s) => s.openModuleView);
  const openSettings = useApp((s) => s.openSettings);
  if (tools.length === 0) {
    return (
      <>
        <p className="hint">No tools yet. Modules add them, such as Tasks and Inventory.</p>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            openSettings('modules');
          }}
        >
          Choose modules
        </button>
      </>
    );
  }
  return (
    <div className="home-tools">
      {tools.map((v) => (
        <button key={v.id} type="button" className="home-tool" onClick={() => void openView(v.id)}>
          {v.tool?.icon}
          <span className="home-tool-name">{v.title}</span>
          <span className="home-tool-hint">{v.tool?.hint}</span>
        </button>
      ))}
    </div>
  );
}

function PageList({ pages, empty }: { pages: PageRef[]; empty: string }) {
  const openPath = useApp((s) => s.openPath);
  if (pages.length === 0) return <p className="hint">{empty}</p>;
  return (
    <ul className="home-pages">
      {pages.map((p) => {
        const where = p.path.split('/').slice(0, -1).join(' › ');
        const changed =
          typeof p.mtime === 'number' ? updatedText(new Date(p.mtime).toISOString()) : null;
        return (
          <li key={p.path}>
            <button type="button" onClick={() => void openPath(p.path)}>
              <span className="home-page-title">{p.title}</span>
              <span className="home-page-detail">
                {[where, changed].filter((s) => s !== null && s !== '').join(' · ')}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PinnedCard() {
  const { pinned } = useHomeLayout();
  const pages = pinned.map((path) => ({
    path,
    title: pageTitle(path.split('/').at(-1) ?? path),
    id: null,
    type: 'page',
  }));
  return <PageList pages={pages} empty="Pin a page with the pin at the top of the page." />;
}

function RecentCard() {
  const recentPages = useApp((s) => s.recentPages);
  // Read again as the index catches up, such as after writing in a page.
  const progress = useApp((s) => s.indexProgress);
  const [pages, setPages] = useState<PageRef[] | null>(null);
  useEffect(() => {
    let current = true;
    void recentPages(RECENT).then((found) => {
      if (current) setPages(found);
    });
    return () => {
      current = false;
    };
  }, [recentPages, progress]);
  if (pages === null) return <p className="hint">Reading…</p>;
  return <PageList pages={pages} empty="Pages you write in show here." />;
}
