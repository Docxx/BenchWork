import { useState } from 'react';
import type { OpenPage, SaveState } from '../state/pageSlice';
import { useApp } from './AppStoreContext';
import { Backlinks } from './Backlinks';
import { PageEditor } from './PageEditor';

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

  return (
    <article className="page-view" aria-label={page ? page.title : 'No page open'}>
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
          <header className="page-header">
            {/* Keyed by path so a rename elsewhere resets the field. */}
            <TitleField key={page.path} page={page} />
            <SaveStatus />
          </header>
          <ConflictBanner />
          {/* A new document after a reload from disk starts a fresh editor. */}
          <PageEditor key={page.ydoc.guid} page={page} />
          <Backlinks />
        </>
      )}
    </article>
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
    <input
      className="page-title"
      aria-label="Page title"
      value={draft}
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
