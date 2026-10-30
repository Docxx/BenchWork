import { Link2, ListTree, Settings2 } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { pageHeadings, type Heading } from '../editor/yjsDoc';
import type { OpenPage } from '../state/pageSlice';
import { useApp } from './AppStoreContext';
import { BacklinkList } from './Backlinks';

const ICON = { size: 17, strokeWidth: 1.75, 'aria-hidden': true } as const;

interface Tab {
  id: string;
  title: string;
  icon: ReactNode;
  render: () => ReactNode;
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

function BacklinksTab() {
  const backlinks = useApp((s) => s.backlinks);
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

/**
 * The panel beside a page: its outline, the pages linking to it, and any
 * tabs modules add. Hidden from Settings > Appearance or the top bar.
 */
export function SidePanel({ page }: { page: OpenPage }) {
  const sideTabs = useApp((s) => s.sideTabs);
  const openSettings = useApp((s) => s.openSettings);
  const [chosen, setChosen] = useState('outline');

  const tabs: Tab[] = [
    {
      id: 'outline',
      title: 'Outline',
      icon: <ListTree {...ICON} />,
      render: () => <Outline page={page} />,
    },
    {
      id: 'backlinks',
      title: 'Linked from',
      icon: <Link2 {...ICON} />,
      render: () => <BacklinksTab />,
    },
    ...sideTabs.map((t) => ({
      id: t.id,
      title: t.title,
      icon: t.icon ?? <span className="tab-letter">{t.title.charAt(0)}</span>,
      render: () => t.render(page.path),
    })),
  ];
  const current = tabs.find((t) => t.id === chosen) ?? tabs[0];

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0 || !current) return;
    e.preventDefault();
    const index = tabs.indexOf(current);
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (!next) return;
    setChosen(next.id);
    document.getElementById(`side-tab-${next.id}`)?.focus();
  };

  return (
    <aside className="side-panel" aria-label="Side panel">
      <div
        className="side-tabs"
        role="tablist"
        aria-label="Side panel"
        data-tauri-drag-region
        onKeyDown={onKey}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`side-tab-${t.id}`}
            type="button"
            role="tab"
            title={t.title}
            aria-label={t.title}
            aria-selected={t.id === current?.id}
            aria-controls="side-tab-panel"
            tabIndex={t.id === current?.id ? 0 : -1}
            className="side-tab"
            onClick={() => {
              setChosen(t.id);
            }}
          >
            {t.icon}
          </button>
        ))}
      </div>
      {current && (
        <div
          className="side-body"
          role="tabpanel"
          id="side-tab-panel"
          aria-labelledby={`side-tab-${current.id}`}
        >
          <p className="side-kicker">{page.title}</p>
          <h2 className="side-title">{current.title}</h2>
          {current.render()}
        </div>
      )}
      <footer className="side-footer">
        <button
          type="button"
          className="quiet"
          onClick={() => {
            openSettings('modules');
          }}
        >
          <Settings2 size={15} strokeWidth={1.75} aria-hidden />
          Customise modules
        </button>
      </footer>
    </aside>
  );
}
