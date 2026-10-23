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
  const rows = useMemo(() => searchLibrary(snap.refs, filter, SHOWN), [snap.refs, filter]);

  if (snap.status === 'missing' || (snap.status === 'error' && snap.count === 0)) {
    return (
      <p className="hint">
        No library yet. Choose the file Better BibTeX keeps up to date in Settings &gt; Modules &gt;
        References.
      </p>
    );
  }

  return (
    <div className="library-panel">
      <input
        type="search"
        aria-label="Find a reference"
        placeholder={`Find in ${String(snap.count)} references`}
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
        }}
      />
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
      {snap.count > rows.length && filter.trim() === '' && (
        <p className="hint">Showing the {String(rows.length)} newest. Type to find others.</p>
      )}
    </div>
  );
}
