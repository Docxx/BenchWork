import {
  CalendarDays,
  CalendarRange,
  Clock,
  LayoutGrid,
  Link2,
  ListTree,
  NotebookPen,
  Pin,
  Search,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { pageHeadings, type Heading } from '../editor/yjsDoc';
import { defaultHomeLayout, type HomeLayout } from '../settings/appSettings';
import { pageTitle } from '../notebooks/notebookTree';
import type { PageRef } from '../platform';
import type { OpenPage } from '../state/pageSlice';
import { useApp } from './AppStoreContext';
import { BacklinkList } from './Backlinks';
import { CalendarWidget } from './CalendarWidget';
import { useQuickNote } from './QuickCapture';
import { updatedText } from './updated';

const ICON = { size: 17, strokeWidth: 1.75, 'aria-hidden': true } as const;

/** How many recent pages the widget lists. */
const RECENT = 8;

/** A widget from the app or a module, as Home and the docks show it. */
export interface WidgetEntry {
  id: string;
  title: string;
  icon: ReactNode;
  wide: boolean;
  starts: { home?: boolean; side?: boolean };
  /** Null for the app's own. */
  moduleId: string | null;
  render: (page: string | null) => ReactNode;
}

const NO_LAYOUT = defaultHomeLayout();

/** The open vault's Home and dock layout, the same object until it changes. */
export function useHomeLayout(): HomeLayout {
  return useApp((s) =>
    s.status.kind === 'open' ? (s.settings.home[s.status.vault.root] ?? NO_LAYOUT) : NO_LAYOUT,
  );
}

function TodayWidget() {
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

function ToolsWidget() {
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

function PinnedWidget() {
  const { pinned } = useHomeLayout();
  const pages = pinned.map((path) => ({
    path,
    title: pageTitle(path.split('/').at(-1) ?? path),
    id: null,
    type: 'page',
  }));
  return <PageList pages={pages} empty="Pin a page with the pin at the top of the page." />;
}

function RecentWidget() {
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

/** The open page's headings; a click goes to one. Kept up to date as the page changes. */
function Outline({ page }: { page: OpenPage }) {
  const goToHeading = useApp((s) => s.goToHeading);
  const [headings, setHeadings] = useState<Heading[]>(() => pageHeadings(page.ydoc));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const update = () => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        setHeadings(pageHeadings(page.ydoc));
      }, 300);
    };
    page.ydoc.on('update', update);
    return () => {
      if (timer !== null) clearTimeout(timer);
      page.ydoc.off('update', update);
    };
  }, [page.ydoc]);

  if (headings.length === 0) {
    return <p className="side-empty">Headings in this page will be listed here.</p>;
  }
  const top = Math.min(...headings.map((h) => h.level));
  return (
    <ul className="outline">
      {headings.map((h, i) => (
        <li
          key={`${String(i)}-${h.text}`}
          style={{ paddingLeft: `${String((h.level - top) * 0.9)}rem` }}
        >
          <button
            type="button"
            className={`outline-item level-${String(h.level - top + 1)}`}
            onClick={() => {
              goToHeading(h.text);
            }}
          >
            {h.text}
          </button>
        </li>
      ))}
    </ul>
  );
}

function OutlineWidget() {
  const page = useApp((s) => s.page);
  if (page === null) return <p className="side-empty">Open a page to see its outline.</p>;
  // Keyed by page, so each page starts afresh.
  return <Outline key={page.path} page={page} />;
}

function BacklinksWidget() {
  const page = useApp((s) => s.page);
  const backlinks = useApp((s) => s.backlinks);
  if (page === null) return <p className="side-empty">Open a page to see what links to it.</p>;
  if (backlinks.length === 0) {
    return <p className="side-empty">Pages that link here will be listed here.</p>;
  }
  const count = backlinks.length;
  return (
    <>
      <p className="side-count">
        {count} {count === 1 ? 'page links' : 'pages link'} here
      </p>
      <BacklinkList />
    </>
  );
}

const BUILT_IN: readonly WidgetEntry[] = [
  {
    id: 'home.today',
    title: 'Today',
    icon: <CalendarDays {...ICON} />,
    wide: false,
    starts: { home: true },
    moduleId: null,
    render: () => <TodayWidget />,
  },
  {
    id: 'home.tools',
    title: 'Tools',
    icon: <LayoutGrid {...ICON} />,
    wide: false,
    starts: { home: true },
    moduleId: null,
    render: () => <ToolsWidget />,
  },
  {
    id: 'home.pinned',
    title: 'Pinned',
    icon: <Pin {...ICON} />,
    wide: false,
    starts: { home: true },
    moduleId: null,
    render: () => <PinnedWidget />,
  },
  {
    id: 'home.recent',
    title: 'Recent pages',
    icon: <Clock {...ICON} />,
    wide: false,
    starts: { home: true },
    moduleId: null,
    render: () => <RecentWidget />,
  },
  {
    id: 'core.calendar',
    title: 'Calendar',
    icon: <CalendarRange {...ICON} />,
    wide: false,
    starts: { home: true },
    moduleId: null,
    render: () => <CalendarWidget />,
  },
  {
    id: 'core.outline',
    title: 'Outline',
    icon: <ListTree {...ICON} />,
    wide: false,
    starts: {},
    moduleId: null,
    render: () => <OutlineWidget />,
  },
  {
    id: 'core.backlinks',
    title: 'Linked from',
    icon: <Link2 {...ICON} />,
    wide: false,
    starts: {},
    moduleId: null,
    render: () => <BacklinksWidget />,
  },
];

/** Every widget there is now: the app's own, then those of modules that are on. */
export function useWidgets(): WidgetEntry[] {
  const fromModules = useApp((s) => s.widgets);
  return [
    ...BUILT_IN,
    ...fromModules.map((w) => ({
      id: w.id,
      title: w.title,
      icon: w.icon ?? <span className="tab-letter">{w.title.charAt(0)}</span>,
      wide: w.wide === true,
      starts: w.starts ?? {},
      moduleId: w.moduleId,
      render: w.render,
    })),
  ];
}
