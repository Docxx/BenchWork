import { useEffect, useState } from 'react';
import { dayOf } from '../pages/daily';
import type { SnapshotRef } from '../pages/snapshots';
import { formatDate } from '../pages/templates';
import { extractPage } from '../search/extract';
import { useApp } from './AppStoreContext';

/** When a snapshot was taken, such as `Today, 10:30` or `20 Oct 2026, 16:05`. */
export function snapshotLabel(time: Date, now: Date = new Date()): string {
  return dayOf(time) === dayOf(now)
    ? `Today, ${formatDate(time, 'HH:mm')}`
    : formatDate(time, 'D MMM YYYY, HH:mm');
}

/** Earlier versions of the open page: pick one to see it, then restore it if wanted. */
export function HistoryPanel({ onClose }: { onClose: () => void }) {
  const pageHistory = useApp((s) => s.pageHistory);
  const readSnapshot = useApp((s) => s.readSnapshot);
  const restoreSnapshot = useApp((s) => s.restoreSnapshot);
  const [snapshots, setSnapshots] = useState<SnapshotRef[] | null>(null);
  const [chosen, setChosen] = useState<SnapshotRef | null>(null);
  const [preview, setPreview] = useState('');

  useEffect(() => {
    void pageHistory().then(setSnapshots);
  }, [pageHistory]);

  useEffect(() => {
    if (chosen === null) return;
    let current = true;
    void readSnapshot(chosen.path)
      .then((text) => {
        // Shown as plain text, so no Markdown syntax appears.
        if (current) setPreview(extractPage(chosen.path, text, { mtime: null, size: 0 }).body);
      })
      .catch(() => {
        if (current) setPreview('This version could not be read.');
      });
    return () => {
      current = false;
    };
  }, [chosen, readSnapshot]);

  return (
    <div
      className="history-panel confirm"
      role="dialog"
      aria-label="Page history"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <h2>Earlier versions</h2>
      {snapshots === null ? null : snapshots.length === 0 ? (
        <p className="hint">
          None yet. A copy is kept when a page changes, at most every ten minutes.
        </p>
      ) : (
        <div className="history-body">
          <ul className="history-list" aria-label="Versions">
            {snapshots.map((s) => (
              <li key={s.path}>
                <button
                  type="button"
                  aria-pressed={chosen?.path === s.path}
                  onClick={() => {
                    setChosen(s);
                  }}
                >
                  {snapshotLabel(s.time)}
                </button>
              </li>
            ))}
          </ul>
          <div className="history-preview" aria-label="Version preview" aria-live="polite">
            {chosen === null ? <p className="hint">Choose a version to see it.</p> : preview}
          </div>
        </div>
      )}
      <div className="actions">
        {chosen !== null && (
          <button
            type="button"
            onClick={() => {
              void restoreSnapshot(chosen.path).then(onClose);
            }}
          >
            Restore this version
          </button>
        )}
        <button type="button" className="quiet" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
