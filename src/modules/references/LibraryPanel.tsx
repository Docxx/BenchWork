import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { ModuleContext } from '@core/api';
import { searchLibrary, shortLabel } from './library';
import { openNote, REFERENCE } from './notes';
import type { LibraryState } from './state';
import { PaperComparison } from './PaperComparison';
import { ReferenceDownload } from './ReferenceDownload';

/** At most this many rows; typing narrows the list. */
export const SHOWN = 100;

/**
 * The Library panel in the sidebar: every reference in the library, with a
 * box to find one. Clicking a reference opens its literature note, making
 * it the first time; references that already have a note are marked.
 */
export function LibraryPanel({
  ctx,
  library,
  fullPage = false,
}: {
  ctx: ModuleContext;
  library: LibraryState;
  fullPage?: boolean;
}) {
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
  const rows = useMemo(
    () => searchLibrary(snap.refs, filter, fullPage ? snap.count : SHOWN),
    [snap.refs, snap.count, filter, fullPage],
  );
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const [pdfs, setPdfs] = useState<Record<string, string>>({});
  const [needsPdf, setNeedsPdf] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [compare, setCompare] = useState(false);
  const [pdfError, setPdfError] = useState('');
  useEffect(() => {
    if (!fullPage) return;
    let live = true;
    let version = 0;
    const refresh = async () => {
      const current = ++version;
      const links = await ctx.storage.read<Record<string, string>>('pdf-citations.json');
      const found = await Promise.all(
        Object.entries(links ?? {}).map(async ([path, key]) =>
          (await ctx.vault.exists(path)) ? ([key, path] as const) : null,
        ),
      );
      if (live && version === current) {
        setPdfs(Object.fromEntries(found.filter((row) => row !== null)));
        setPdfError('');
      }
    };
    const load = () => {
      void refresh().catch((err: unknown) => {
        if (live) setPdfError(String(err));
      });
    };
    const sub = ctx.vault.watch((change) => {
      if (
        change.paths.some(
          (p) => p.endsWith('pdf-citations.json') || p.toLowerCase().endsWith('.pdf'),
        )
      )
        load();
    });
    load();
    return () => {
      live = false;
      sub.dispose();
    };
  }, [ctx, fullPage]);
  const visible = rows.filter((r) => !needsPdf || !pdfs[r.key]);

  if (snap.status === 'missing' || (snap.status === 'error' && snap.count === 0)) {
    return (
      <p className="hint">
        No library yet. Choose the file Better BibTeX keeps up to date in Settings &gt; Modules &gt;
        Reading and writing.
      </p>
    );
  }

  return (
    <div className={fullPage ? 'library-panel zotero-library' : 'library-panel'}>
      {!fullPage && (
        <button type="button" onClick={() => void ctx.app.openView('references.zoteroLibrary')}>
          Open Zotero references
        </button>
      )}
      <input
        type="search"
        aria-label="Find a reference"
        placeholder={`Find in ${String(snap.count)} references`}
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
        }}
      />
      {fullPage && (
        <div className="actions zotero-filters">
          <label>
            <input
              type="checkbox"
              checked={needsPdf}
              onChange={(e) => {
                setNeedsPdf(e.target.checked);
              }}
            />{' '}
            Needs PDF
          </label>
          <button
            type="button"
            disabled={selected.length < 2}
            onClick={() => {
              setCompare(!compare);
            }}
          >
            {compare ? 'Close comparison' : 'Compare papers'} ({selected.length})
          </button>
        </div>
      )}
      {pdfError && <p role="alert">{pdfError}</p>}
      {compare && selected.length >= 2 && (
        <PaperComparison ctx={ctx} references={selected.flatMap((k) => snap.refs.get(k) ?? [])} />
      )}
      {visible.length === 0 ? (
        <p className="hint">No matching references.</p>
      ) : (
        <ul className="library-list" aria-label="References">
          {visible.map((row) => {
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
                {fullPage && (
                  <label className="compare-paper">
                    <input
                      aria-label={'Compare ' + row.detail}
                      type="checkbox"
                      checked={selected.includes(row.key)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelected((prev) =>
                          checked ? [...prev, row.key] : prev.filter((k) => k !== row.key),
                        );
                      }}
                    />{' '}
                    Compare
                  </label>
                )}
                {fullPage && pdfs[row.key] && (
                  <button onClick={() => void ctx.app.open(pdfs[row.key] ?? '')}>Open PDF</button>
                )}
                {fullPage &&
                  !pdfs[row.key] &&
                  ref &&
                  (activeKey === row.key ? (
                    <ReferenceDownload
                      ctx={ctx}
                      reference={ref}
                      onSaved={(path) => {
                        setPdfs((prev) => ({ ...prev, [row.key]: path }));
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveKey(row.key);
                      }}
                    >
                      Download PDF
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
      {!fullPage && snap.count > rows.length && filter.trim() === '' && (
        <p className="hint">Showing the {String(rows.length)} newest. Type to find others.</p>
      )}
    </div>
  );
}
