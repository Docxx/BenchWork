import { ChevronRight, FileText, History, LayoutDashboard, PanelRight } from 'lucide-react';
import { useState } from 'react';
import { dayOfPath } from '../pages/daily';
import type { OpenPage, SaveState } from '../state/pageSlice';
import { useApp } from './AppStoreContext';
import { Backlinks } from './Backlinks';
import { FileView } from './FileView';
import { HistoryPanel } from './HistoryPanel';
import { ModuleView } from './ModuleView';
import { PageEditor } from './PageEditor';
import { PropertiesPanel } from './PropertiesPanel';
import { updatedText } from './updated';

const SAVE_LABELS: Record<SaveState, string> = {
  saved: 'Saved',
  unsaved: 'Edited',
  saving: 'Saving…',
  error: 'Not saved',
};

/** The main area: the open page, or a hint to pick one. */
export function PageView() {
  const page = useApp((s) => s.page);
  const notice = useApp((s) => s.pageNotice);
  const dismissNotice = useApp((s) => s.dismissPageNotice);
  const openFile = useApp((s) => s.openFile);
  const moduleView = useApp((s) => s.moduleView);
  const [showHistory, setShowHistory] = useState(false);
  const sidePanel = useApp((s) => s.settings.appearance.sidePanel);
  const free = useApp((s) => s.pageProperties?.['layout']) === 'free';

  if (page === null && moduleView !== null) return <ModuleView open={moduleView} />;
  if (page === null && openFile !== null) return <FileView path={openFile} />;

  return (
    <>
      {page !== null && (
        <PageTopBar
          page={page}
          historyOpen={showHistory}
          onHistory={() => {
            setShowHistory((open) => !open);
          }}
        />
      )}
      <article
        className={free ? 'page-view free' : 'page-view'}
        aria-label={page ? page.title : 'No page open'}
      >
        {notice !== null && (
          <div className="notice page-notice" role="alert">
            <span>{notice}</span>
            <button type="button" className="quiet" aria-label="Dismiss" onClick={dismissNotice}>
              ×
            </button>
          </div>
        )}
        {page === null ? (
          <p className="page-empty">
            Pick a page in the sidebar, or create one from a notebook’s menu.
          </p>
        ) : (
          <>
            <PageStatus />
            <header className="page-header">
              {/* Keyed by path so a rename elsewhere resets the field. */}
              <TitleField key={page.path} page={page} />
              {dayOfPath(page.path) !== null && <DayArrows />}
            </header>
            <PageLead />
            <ConflictBanner />
            {showHistory && (
              <HistoryPanel
                key={page.path}
                onClose={() => {
                  setShowHistory(false);
                }}
              />
            )}
            <PropertiesPanel />
            {/* A new document after a reload from disk starts a fresh editor. */}
            <PageEditor key={page.ydoc.guid} page={page} />
            {!sidePanel && <Backlinks />}
          </>
        )}
      </article>
    </>
  );
}

/** Across the top: where the page is, whether it is saved, and its history. */
function PageTopBar({
  page,
  historyOpen,
  onHistory,
}: {
  page: OpenPage;
  historyOpen: boolean;
  onHistory: () => void;
}) {
  const folders = page.path.split('/').slice(0, -1);
  return (
    <div className="top-bar">
      <nav className="breadcrumb" aria-label="Where this page is">
        {folders.map((folder, i) => (
          <span key={folders.slice(0, i + 1).join('/')} className="crumb">
            {folder}
            <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
          </span>
        ))}
        <span className="crumb current" aria-current="page">
          {page.title}
        </span>
      </nav>
      <SaveStatus />
      <button
        type="button"
        className="quiet top-button"
        aria-pressed={historyOpen}
        onClick={onHistory}
      >
        <History size={16} strokeWidth={1.75} aria-hidden />
        History
      </button>
      <LayoutSwitch />
      <SidePanelToggle />
    </div>
  );
}

/** Document or free layout, for this page. */
function LayoutSwitch() {
  const layout = useApp((s) => s.pageProperties?.['layout']) === 'free' ? 'free' : 'document';
  const setProperties = useApp((s) => s.setPageProperties);
  const options = [
    { value: 'document', label: 'Document', icon: FileText },
    { value: 'free', label: 'Free layout', icon: LayoutDashboard },
  ] as const;
  return (
    <div className="layout-switch" role="radiogroup" aria-label="Page layout">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={layout === value}
          title={label}
          aria-label={label}
          onClick={() => {
            if (value !== layout) setProperties({ layout: value === 'free' ? 'free' : null });
          }}
        >
          <Icon size={16} strokeWidth={1.75} aria-hidden />
        </button>
      ))}
    </div>
  );
}

function SidePanelToggle() {
  const shown = useApp((s) => s.settings.appearance.sidePanel);
  const setAppearance = useApp((s) => s.setAppearance);
  const label = shown ? 'Hide the side panel' : 'Show the side panel';
  return (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      aria-pressed={shown}
      onClick={() => void setAppearance({ sidePanel: !shown })}
    >
      <PanelRight size={17} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

/** A page's status, as a pill, and when it last changed. */
function PageStatus() {
  const properties = useApp((s) => s.pageProperties);
  const status = properties?.['status'];
  const updated = updatedText(properties?.['modified']);
  if (typeof status !== 'string' && updated === null) return null;
  return (
    <p className="page-status">
      {typeof status === 'string' && status.trim() !== '' && (
        <span className="status-pill">{status}</span>
      )}
      {updated !== null && <span className="page-updated">{updated}</span>}
    </p>
  );
}

/** The page's `description`, as an introduction under the title. */
function PageLead() {
  const description = useApp((s) => s.pageProperties?.['description']);
  if (typeof description !== 'string') return null;
  // Starts afresh when the description changes elsewhere, such as on disk.
  return <LeadField key={description} description={description} />;
}

function LeadField({ description }: { description: string }) {
  const setProperties = useApp((s) => s.setPageProperties);
  const [draft, setDraft] = useState(description);
  return (
    <textarea
      className="page-lead"
      aria-label="Description"
      rows={1}
      value={draft}
      placeholder="Add a short description"
      ref={(el) => {
        // Grows with its text, like a paragraph.
        if (el) {
          el.style.height = 'auto';
          el.style.height = `${String(el.scrollHeight)}px`;
        }
      }}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      onBlur={() => {
        if (draft !== description) setProperties({ description: draft });
      }}
    />
  );
}

function TitleField({ page }: { page: OpenPage }) {
  const renameItem = useApp((s) => s.renameItem);
  const [draft, setDraft] = useState(page.title);

  const commit = () => {
    const title = draft.trim();
    if (title === '' || title === page.title) {
      setDraft(page.title);
      return;
    }
    void renameItem(page.path, title).then((path) => {
      if (path === null) setDraft(page.title);
    });
  };

  return (
    <textarea
      className="page-title"
      aria-label="Page title"
      rows={1}
      value={draft}
      ref={(el) => {
        // Wraps onto more lines for a long title, like a heading.
        if (el) {
          el.style.height = 'auto';
          el.style.height = `${String(el.scrollHeight)}px`;
        }
      }}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          // Carry on writing in the page.
          document.querySelector<HTMLElement>('.page-editor')?.focus();
        } else if (e.key === 'Escape') {
          setDraft(page.title);
        }
      }}
    />
  );
}

/** Previous and next daily page, skipping days without one. */
function DayArrows() {
  const { previous, next } = useApp((s) => s.dayNeighbours);
  const openPage = useApp((s) => s.openPage);
  return (
    <span className="day-arrows">
      <button
        type="button"
        className="quiet"
        aria-label="Previous day"
        title="Previous day"
        disabled={previous === null}
        onClick={() => {
          if (previous !== null) void openPage(previous);
        }}
      >
        ‹
      </button>
      <button
        type="button"
        className="quiet"
        aria-label="Next day"
        title="Next day"
        disabled={next === null}
        onClick={() => {
          if (next !== null) void openPage(next);
        }}
      >
        ›
      </button>
    </span>
  );
}

function SaveStatus() {
  const state = useApp((s) => s.saveState);
  return (
    <span className={`save-status ${state}`} role="status" aria-live="polite">
      {SAVE_LABELS[state]}
    </span>
  );
}

function ConflictBanner() {
  const conflict = useApp((s) => s.pageConflict);
  const keepMine = useApp((s) => s.keepMyVersion);
  const loadDisk = useApp((s) => s.loadDiskVersion);
  if (conflict === null) return null;
  const deleted = conflict.diskText === null;

  return (
    <div className="confirm conflict" role="alertdialog" aria-labelledby="conflict-text">
      <p id="conflict-text">
        {deleted
          ? 'This page was deleted outside BenchWork while you were editing it.'
          : 'This page was changed outside BenchWork while you were editing it.'}{' '}
        Whichever version you choose, the other is kept as a snapshot.
      </p>
      <div className="actions">
        <button type="button" onClick={() => void keepMine()}>
          Keep my version
        </button>
        <button type="button" onClick={() => void loadDisk()}>
          {deleted ? 'Close the page' : 'Use the other version'}
        </button>
      </div>
    </div>
  );
}
