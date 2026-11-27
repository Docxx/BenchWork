import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ModuleContext } from '@core/api';
import { searchLibrary, shortLabel } from './library';
import { openNote, REFERENCE } from './notes';
import type { LibraryState } from './state';

/** At most this many rows; typing narrows the list. */
export const SHOWN = 100;

/**
 * The Library panel in the sidebar: every reference in the library, with a
 * box to find one. Clicking a reference opens its literature note, making
 * it the first time; references that already have a note are marked.
 */
export function LibraryPanel({ ctx, library }: { ctx: ModuleContext; library: LibraryState }) {
  const snap = useSyncExternalStore(library.subscribe, library.current);
  const [filter, setFilter] = useState('');
  const [subject, setSubject] = useState('');
  const subjects = useMemo(() => {
    const labels = new Map<string, string>();
    for (const ref of snap.refs.values())
      for (const label of ref.subjects ?? []) labels.set(label.toLowerCase(), label);
    return [...labels].sort((a, b) => a[1].localeCompare(b[1]));
  }, [snap.refs]);
  const [withNotes, setWithNotes] = useState<ReadonlySet<string>>(new Set());

  // Which references already have a note; checked again after each reload
  // and each note opened.
  const [notesChecked, setNotesChecked] = useState(0);
  useEffect(() => {
    let current = true;
    void ctx.app
      .items()
      .catch(() => [])
      .then((items) => {
        if (current) {
          setWithNotes(new Set(items.filter((i) => i.type === REFERENCE).map((i) => i.title)));
        }
      });
    return () => {
      current = false;
    };
  }, [ctx, snap.refs, notesChecked]);

  // An empty filter lists the newest; typing narrows it.
  const rows = useMemo(() => {
    const refs = subject
      ? new Map(
          [...snap.refs].filter(([, ref]) =>
            ref.subjects?.some((s) => s.toLowerCase() === subject),
          ),
        )
      : snap.refs;
    return searchLibrary(refs, filter, SHOWN);
  }, [snap.refs, filter, subject]);

  if (snap.status === 'missing' || (snap.status === 'error' && snap.count === 0)) {
    return (
      <p className="hint">
        No library yet. Connect your Zotero account, or choose the file Better BibTeX keeps up to
        date, in Settings &gt; Modules &gt; Reading and writing.
      </p>
    );
  }

  return (
    <div className="library-panel">
      <button type="button" onClick={() => void ctx.app.openView('references.zoteroLibrary')}>
        Open Zotero references
      </button>
      <input
        type="search"
        aria-label="Find a reference"
        placeholder={`Find in ${String(snap.count)} references`}
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
        }}
      />
      {(subjects.length > 0 || subject) && (
        <select
          aria-label="Reference subject"
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
          }}
        >
          <option value="">All subjects</option>
          {subjects.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      )}
      {rows.length === 0 ? (
        <p className="hint">No matching references.</p>
      ) : (
        <ul className="library-list" aria-label="References">
          {rows.map((row) => {
            const ref = snap.refs.get(row.key);
            return (
              <li key={row.key}>
                <button
                  type="button"
                  className="library-item"
                  title={`@${row.key}`}
                  onClick={() => {
                    void openNote(ctx, library, row.key).then(() => {
                      setNotesChecked((n) => n + 1);
                    });
                  }}
                >
                  <span className="library-label">
                    {ref ? shortLabel(ref) : row.label}
                    {withNotes.has(row.key) && <span className="library-note">Note</span>}
                  </span>
                  <span className="library-title">{row.detail}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!subject && snap.count > rows.length && filter.trim() === '' && (
        <p className="hint">Showing the {String(rows.length)} newest. Type to find others.</p>
      )}
    </div>
  );
}
