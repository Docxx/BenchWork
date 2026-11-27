import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ModuleContext } from '@core/api';
import {
  collectionAndBelow,
  findReferences,
  NO_FILTER,
  UNFILED,
  type Collection,
  type LibraryFilter,
  type LibrarySort,
  type Reference,
} from './library';
import { openNote, REFERENCE } from './notes';
import type { LibraryState } from './state';
import type { ZoteroConnection } from './zoteroAccount';
import { PaperComparison } from './PaperComparison';
import { ReferenceDownload, saveReferencePdf } from './ReferenceDownload';

/** Rows drawn at once; filtering or searching narrows the rest. */
export const ROWS = 300;

const COLUMNS: [LibrarySort, string][] = [
  ['author', 'Author'],
  ['year', 'Year'],
  ['title', 'Title'],
  ['journal', 'Journal'],
];

function names(ref: Reference): string {
  const [first, second] = ref.authors;
  if (!first) return '';
  if (ref.authors.length === 1 || !second) return first.family;
  if (ref.authors.length === 2) return `${first.family} and ${second.family}`;
  return `${first.family} et al.`;
}

function doiLink(ref: Reference): string {
  if (!ref.doi) return ref.url;
  return /^https?:/i.test(ref.doi) ? ref.doi : 'https://doi.org/' + ref.doi;
}

/** Which references have a PDF in the vault, kept up to date as PDFs come and go. */
function usePdfIndex(ctx: ModuleContext) {
  const [pdfs, setPdfs] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
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
        setReady(true);
        setPdfs(Object.fromEntries(found.filter((row) => row !== null)));
        setError('');
      }
    };
    const load = () => {
      void refresh().catch((err: unknown) => {
        if (live) setError(String(err));
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
  }, [ctx]);
  return { pdfs, setPdfs, ready, error };
}

/** Collections as an indented tree, top level first. */
function tree(collections: readonly Collection[]): { c: Collection; depth: number }[] {
  const known = new Set(collections.map((c) => c.key));
  const children = new Map<string | null, Collection[]>();
  for (const c of collections) {
    const parent = c.parent && known.has(c.parent) ? c.parent : null;
    children.set(parent, [...(children.get(parent) ?? []), c]);
  }
  const out: { c: Collection; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const c of (children.get(parent) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
      out.push({ c, depth });
      walk(c.key, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/**
 * The Zotero library page: collections and tags down the side, a sortable
 * table in the middle, and the chosen reference's details beside it.
 */
export function LibraryBrowser({
  ctx,
  library,
  zotero,
}: {
  ctx: ModuleContext;
  library: LibraryState;
  zotero: ZoteroConnection;
}) {
  const snap = useSyncExternalStore(library.subscribe, library.current);
  const account = useSyncExternalStore(zotero.subscribe, zotero.current);
  useEffect(() => {
    void zotero.syncIfStale();
  }, [zotero]);

  const [filter, setFilter] = useState<LibraryFilter>(NO_FILTER);
  const [sort, setSort] = useState<LibrarySort>('added');
  const [descending, setDescending] = useState(true);
  const [needsPdf, setNeedsPdf] = useState(false);
  const [hasNote, setHasNote] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [compare, setCompare] = useState(false);
  const { pdfs, setPdfs, ready: pdfIndexReady, error: pdfError } = usePdfIndex(ctx);

  const [withNotes, setWithNotes] = useState<ReadonlySet<string>>(new Set());
  const [notesChecked, setNotesChecked] = useState(0);
  useEffect(() => {
    let current = true;
    void ctx.app
      .items()
      .catch(() => [])
      .then((items) => {
        if (current)
          setWithNotes(new Set(items.filter((i) => i.type === REFERENCE).map((i) => i.title)));
      });
    return () => {
      current = false;
    };
  }, [ctx, snap.refs, notesChecked]);

  // Typing ranks by best match until a column is chosen again.
  const typing = filter.text.trim() !== '';
  const effectiveSort: LibrarySort = typing && sort === 'added' ? 'relevance' : sort;
  const found = useMemo(
    () => findReferences(snap.refs, snap.collections, filter, effectiveSort, descending),
    [snap.refs, snap.collections, filter, effectiveSort, descending],
  );
  const rows = found.filter(
    (r) => (!needsPdf || !pdfs[r.key]) && (!hasNote || withNotes.has(r.key)),
  );
  const current = (chosen && snap.refs.get(chosen)) || null;

  const tags = useMemo(() => {
    const all = new Set<string>();
    for (const ref of snap.refs.values()) for (const t of ref.tags ?? []) all.add(t);
    return [...all].sort((a, b) => a.localeCompare(b));
  }, [snap.refs]);
  // Each collection counts the references in it and beneath it, as picking it shows.
  const counts = useMemo(() => {
    const below = new Map(
      snap.collections.map((c) => [c.key, collectionAndBelow(snap.collections, c.key)]),
    );
    const n = new Map<string, number>();
    for (const [key, keys] of below) {
      let count = 0;
      for (const ref of snap.refs.values()) if (ref.collections?.some((c) => keys.has(c))) count++;
      n.set(key, count);
    }
    return n;
  }, [snap.refs, snap.collections]);
  const unfiled = useMemo(
    () => [...snap.refs.values()].filter((r) => !r.collections?.length).length,
    [snap.refs],
  );

  // Downloading every missing PDF in the list, one at a time.
  const batch = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      batch.current?.abort();
    },
    [ctx],
  );
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');
  async function downloadMissing() {
    const missing = rows.filter((ref) => !pdfs[ref.key]);
    const controller = new AbortController();
    batch.current = controller;
    let saved = 0;
    let unavailable = 0;
    setDownloading(true);
    try {
      for (const [index, ref] of missing.entries()) {
        if (controller.signal.aborted) return;
        setDownloadStatus(
          `Checking ${String(index + 1)} of ${String(missing.length)} · ${ref.title || ref.key}`,
        );
        const url = ref.pdfUrl || ref.url || (ref.doi && doiLink(ref));
        if (!url) {
          unavailable++;
          continue;
        }
        try {
          const bytes = await ctx.files.downloadPaper(url);
          controller.signal.throwIfAborted();
          const path = await saveReferencePdf(ctx, ref, bytes);
          setPdfs((prev) => ({ ...prev, [ref.key]: path }));
          saved++;
        } catch {
          unavailable++;
        }
      }
      setDownloadStatus(`PDFs saved: ${String(saved)}. Still missing: ${String(unavailable)}.`);
    } finally {
      setDownloading(false);
    }
  }

  if (snap.status === 'missing' || (snap.status === 'error' && snap.count === 0)) {
    return (
      <p className="hint">
        No library yet. Connect your Zotero account, or choose the file Better BibTeX keeps up to
        date, in Settings &gt; Modules &gt; Reading and writing.
      </p>
    );
  }

  const update = (next: Partial<LibraryFilter>) => {
    setFilter((f) => ({ ...f, ...next }));
  };
  const navButton = (label: string, active: boolean, onClick: () => void, count?: number) => (
    <button type="button" className="zl-nav-item" aria-pressed={active} onClick={onClick}>
      <span>{label}</span>
      {count !== undefined && <span className="zl-count">{count}</span>}
    </button>
  );
  const heading = (column: LibrarySort, label: string) => (
    <th
      key={column}
      className={column === 'journal' ? 'zl-col-journal' : undefined}
      aria-sort={effectiveSort === column ? (descending ? 'descending' : 'ascending') : undefined}
    >
      <button
        type="button"
        className="zl-sort"
        onClick={() => {
          if (sort === column) setDescending(!descending);
          else {
            setSort(column);
            setDescending(column === 'year');
          }
        }}
      >
        {label}
        {effectiveSort === column ? (descending ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  );

  return (
    <div className="zotero-browser">
      <div className="zl-layout">
        <nav className="zl-side" aria-label="Collections">
          {navButton(
            'All references',
            filter.collection === null && filter.tag === null,
            () => {
              update({ collection: null, tag: null });
            },
            snap.count,
          )}
          {snap.collections.length > 0 && (
            <>
              {navButton(
                'Unfiled',
                filter.collection === UNFILED,
                () => {
                  update({ collection: UNFILED, tag: null });
                },
                unfiled,
              )}
              <p className="zl-group">Collections</p>
              {tree(snap.collections).map(({ c, depth }) => (
                <div key={c.key} style={{ paddingLeft: `${String(depth * 0.9)}rem` }}>
                  {navButton(
                    c.name,
                    filter.collection === c.key,
                    () => {
                      update({ collection: c.key, tag: null });
                    },
                    counts.get(c.key) ?? 0,
                  )}
                </div>
              ))}
            </>
          )}
          {tags.length > 0 && (
            <>
              <p className="zl-group">Tags</p>
              {tags.map((t) => (
                <div key={t}>
                  {navButton(t, filter.tag === t, () => {
                    update({ tag: filter.tag === t ? null : t });
                  })}
                </div>
              ))}
            </>
          )}
          <div className="zl-sync">
            {account.account ? (
              <>
                <button
                  type="button"
                  className="zl-nav-item"
                  disabled={account.syncing}
                  onClick={() => void zotero.sync()}
                >
                  {account.syncing ? 'Syncing…' : 'Sync with Zotero'}
                </button>
                {account.lastSynced !== null && !account.syncing && (
                  <span className="hint">
                    Synced{' '}
                    {new Date(account.lastSynced).toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </>
            ) : (
              !snap.zotero && (
                <span className="hint">
                  Connect your Zotero account in Settings to see collections and tags.
                </span>
              )
            )}
            {account.error && <p role="alert">{account.error}</p>}
          </div>
        </nav>

        <section className="zl-main" aria-label="References">
          <input
            type="search"
            aria-label="Find a reference"
            placeholder={`Search ${String(snap.count)} references by title, author, journal or abstract`}
            value={filter.text}
            onChange={(e) => {
              update({ text: e.target.value });
            }}
          />
          <div className="zl-filters">
            <label>
              From{' '}
              <input
                aria-label="From year"
                inputMode="numeric"
                placeholder="year"
                value={filter.yearFrom}
                onChange={(e) => {
                  update({ yearFrom: e.target.value.replace(/\D/g, '').slice(0, 4) });
                }}
              />
            </label>
            <label>
              to{' '}
              <input
                aria-label="To year"
                inputMode="numeric"
                placeholder="year"
                value={filter.yearTo}
                onChange={(e) => {
                  update({ yearTo: e.target.value.replace(/\D/g, '').slice(0, 4) });
                }}
              />
            </label>
            <input
              aria-label="Journal"
              placeholder="Journal"
              value={filter.journal}
              onChange={(e) => {
                update({ journal: e.target.value });
              }}
            />
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
            <label>
              <input
                type="checkbox"
                checked={hasNote}
                onChange={(e) => {
                  setHasNote(e.target.checked);
                }}
              />{' '}
              Has note
            </label>
          </div>
          <div className="zl-actions">
            <span className="hint" role="status" aria-label="Shown references">
              {rows.length === snap.count
                ? `${String(rows.length)} references`
                : `${String(rows.length)} of ${String(snap.count)} references`}
            </span>
            <button
              type="button"
              className="zl-plain"
              disabled={!pdfIndexReady || downloading || !rows.some((r) => !pdfs[r.key])}
              onClick={() => void downloadMissing()}
            >
              Download missing PDFs in results
            </button>
            <button
              type="button"
              className="zl-plain"
              disabled={selected.length < 2}
              onClick={() => {
                setCompare(!compare);
              }}
            >
              {compare ? 'Close comparison' : 'Compare papers'} ({selected.length})
            </button>
          </div>
          {downloadStatus && <p role="status">{downloadStatus}</p>}
          {pdfError && <p role="alert">{pdfError}</p>}
          {compare && selected.length >= 2 && (
            <PaperComparison
              ctx={ctx}
              references={selected.flatMap((k) => snap.refs.get(k) ?? [])}
            />
          )}
          {rows.length === 0 ? (
            <p className="hint">No matching references.</p>
          ) : (
            <table className="zl-table">
              <thead>
                <tr>
                  <th className="zl-pick">
                    <span className="sr-only">Compare</span>
                  </th>
                  {COLUMNS.map(([column, label]) => heading(column, label))}
                  <th className="zl-files">Files</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, ROWS).map((ref) => (
                  <tr
                    key={ref.key}
                    aria-selected={ref.key === chosen}
                    onClick={() => {
                      setChosen(ref.key);
                    }}
                  >
                    <td className="zl-pick">
                      <input
                        type="checkbox"
                        aria-label={'Compare ' + (ref.title || ref.key)}
                        checked={selected.includes(ref.key)}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSelected((prev) =>
                            checked ? [...prev, ref.key] : prev.filter((k) => k !== ref.key),
                          );
                        }}
                      />
                    </td>
                    <td>{names(ref)}</td>
                    <td>{ref.year ?? ''}</td>
                    <td>
                      <button
                        type="button"
                        className="zl-title"
                        title={`@${ref.key}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setChosen(ref.key);
                        }}
                      >
                        {ref.title || ref.key}
                      </button>
                    </td>
                    <td className="zl-col-journal">{ref.container}</td>
                    <td className="zl-files">
                      {pdfs[ref.key] && <span className="zl-badge">PDF</span>}
                      {withNotes.has(ref.key) && <span className="zl-badge">Note</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {rows.length > ROWS && (
            <p className="hint">
              Showing the first {String(ROWS)}. Search or pick a collection to narrow the list.
            </p>
          )}
        </section>

        <aside className="zl-details" aria-label="Reference details">
          {current ? (
            <Details
              key={current.key}
              ctx={ctx}
              reference={current}
              collections={snap.collections}
              pdf={pdfs[current.key] ?? ''}
              hasNote={withNotes.has(current.key)}
              busy={downloading}
              onPdf={(path) => {
                setPdfs((prev) => ({ ...prev, [current.key]: path }));
              }}
              onNote={() => {
                void openNote(ctx, library, current.key).then(() => {
                  setNotesChecked((n) => n + 1);
                });
              }}
            />
          ) : (
            <p className="hint">Choose a reference to see its details.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function Details({
  ctx,
  reference: ref,
  collections,
  pdf,
  hasNote,
  busy,
  onPdf,
  onNote,
}: {
  ctx: ModuleContext;
  reference: Reference;
  collections: readonly Collection[];
  pdf: string;
  hasNote: boolean;
  busy: boolean;
  onPdf: (path: string) => void;
  onNote: () => void;
}) {
  const [download, setDownload] = useState(false);
  const [full, setFull] = useState(false);
  const inCollections = collections.filter((c) => ref.collections?.includes(c.key));
  const link = doiLink(ref);
  const abstract = ref.abstract ?? '';
  return (
    <article>
      <h2>{ref.title || ref.key}</h2>
      <p>
        {ref.authors.map((a) => [a.given, a.family].filter(Boolean).join(' ')).join(', ') ||
          'No authors'}
        {' · '}
        {ref.year ?? 'n.d.'}
      </p>
      {ref.container && <p className="zl-journal">{ref.container}</p>}
      {(inCollections.length > 0 || (ref.tags?.length ?? 0) > 0) && (
        <p className="zl-chips">
          {inCollections.map((c) => (
            <span key={c.key} className="zl-badge">
              {c.name}
            </span>
          ))}
          {ref.tags?.map((t) => (
            <span key={t} className="zl-badge">
              #{t}
            </span>
          ))}
        </p>
      )}
      {abstract && (
        <div className="zl-abstract">
          <p>
            {full || abstract.length <= 420 ? abstract : abstract.slice(0, 400).trimEnd() + '…'}
          </p>
          {abstract.length > 420 && (
            <button
              type="button"
              className="zl-link"
              onClick={() => {
                setFull(!full);
              }}
            >
              {full ? 'Show less' : 'Show the whole abstract'}
            </button>
          )}
        </div>
      )}
      <div className="zl-detail-actions">
        {pdf ? (
          <button type="button" className="zl-plain" onClick={() => void ctx.app.open(pdf)}>
            Open PDF
          </button>
        ) : download ? (
          <ReferenceDownload ctx={ctx} reference={ref} onSaved={onPdf} />
        ) : (
          <button
            type="button"
            className="zl-plain"
            disabled={busy}
            onClick={() => {
              setDownload(true);
            }}
          >
            Download PDF
          </button>
        )}
        <button type="button" className="zl-plain" onClick={onNote}>
          {hasNote ? 'Open literature note' : 'Make literature note'}
        </button>
        <button
          type="button"
          className="zl-plain"
          onClick={() => {
            void navigator.clipboard
              .writeText(`[@${ref.key}]`)
              .then(() => {
                ctx.app.notify(`Copied [@${ref.key}]`);
              })
              .catch(() => {
                ctx.app.notify('Could not copy. The citation is [@' + ref.key + ']');
              });
          }}
        >
          Copy citation [@{ref.key}]
        </button>
        {link && (
          <button type="button" className="zl-plain" onClick={() => void ctx.web.open(link)}>
            {ref.doi ? 'Open DOI' : 'Open web page'}
          </button>
        )}
      </div>
    </article>
  );
}
