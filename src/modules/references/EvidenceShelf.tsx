import { FigureImage } from './FigureImage';
export { FigureImage } from './FigureImage';
import { SendToMap } from './SendToMap';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ModuleContext } from '@core/api';
import { fullReference } from './library';
import type { LibraryState } from './state';
import { parseNotes, notesPath } from '../handwriting/pdfNotes';
import { paperPaths, parsePdfLibrary } from './filePaper';
import { EVIDENCE, READING, type Capture } from './evidence';

export interface Entry {
  finding?: string;
  capture?: Capture;
  title: string;
  path: string;
  subjects: string[];
  source: string;
  heading: string;
  reference: string;
  excerpt: string;
  comment: string;
  citekey: string;
  figure: string;
}
const string = (value: unknown) => (typeof value === 'string' ? value : '');

export type EvidenceSort = 'source' | 'title' | 'subject';

/** Evidence in reading order (paper, then page), by title, or by first subject. */
export function sortEvidence<T extends Pick<Entry, 'title' | 'subjects' | 'source' | 'heading'>>(
  entries: readonly T[],
  sort: EvidenceSort,
): T[] {
  return [...entries].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title);
    if (sort === 'subject') {
      const order = (a.subjects[0] ?? '').localeCompare(b.subjects[0] ?? '');
      if (order) return order;
    }
    return (
      a.source.localeCompare(b.source) ||
      a.heading.localeCompare(b.heading, undefined, { numeric: true })
    );
  });
}

export function useEvidence(ctx: ModuleContext) {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let request = 0;
    async function load() {
      const token = ++request;
      const items = (await ctx.app.items()).filter((item) => item.type === EVIDENCE);
      const rows: Entry[] = await Promise.all(
        items.map(async (item) => {
          const [props, markdown] = await Promise.all([
            ctx.app.pageProperties(item.path),
            ctx.vault.readText(item.path),
          ]);
          const source = /^\[\[(.*?)#page=\d+.*?\]\]$/.exec(string(props?.['source']))?.[1] ?? '';
          const id = string(props?.['highlightId']);
          const page = string(props?.['page']) || '1';
          const subjects = props?.['subjects'];
          return {
            ...item,
            finding:
              markdown
                .split(/^## Main finding[ \t]*\r?$/m)[1]
                ?.split(/^## /m)[0]
                ?.trim() ?? '',
            subjects: Array.isArray(subjects)
              ? subjects.filter((s): s is string => typeof s === 'string')
              : [],
            source,
            heading: 'page=' + page + (id ? '&highlight=' + id : ''),
            excerpt: string(props?.['excerpt']),
            citekey: string(props?.['citekey']),
            reference: string(props?.['reference']),
            figure: string(props?.['figure']),
            comment:
              markdown
                .split(/^## Notes[ \t]*\r?$/m)[1]
                ?.split(/^## /m)[0]
                ?.trim() ?? '',
          };
        }),
      );
      const settings = parsePdfLibrary(await ctx.storage.read('reading-library.json'));
      const folder = settings.folder ?? 'Papers';
      const references = await ctx.storage.read<Record<string, string>>('paper-references.json');
      const citations = await ctx.storage.read<Record<string, string>>('pdf-citations.json');
      for (const row of rows) {
        if (!row.citekey) row.citekey = citations?.[row.source] ?? '';
        if (!row.reference) row.reference = references?.[row.source] ?? '';
      }
      const filed = new Set(rows.map((row) => row.source + '#' + row.heading));
      if (!folder || (await ctx.vault.exists(folder))) {
        for (const source of await paperPaths(ctx, folder, settings.recursive)) {
          const sidecar = notesPath(source);
          if (!(await ctx.vault.exists(sidecar))) continue;
          const notes = parseNotes(await ctx.vault.readText(sidecar));
          for (const [page, annotations] of Object.entries(notes?.pages ?? {})) {
            for (const h of annotations.highlights) {
              const heading = 'page=' + page + '&highlight=' + h.id;
              if (filed.has(source + '#' + heading)) continue;
              rows.push({
                path: source + '#' + heading,
                source,
                heading,
                title: source.split('/').at(-1) ?? source,
                subjects: [],
                excerpt: h.text,
                comment: '',
                figure: h.figure ?? '',
                citekey: citations?.[source] ?? '',
                reference: references?.[source] ?? '',
                capture: {
                  mode: 'excerpt',
                  path: source,
                  page: Number(page),
                  highlightId: h.id,
                  text: h.text,
                  ...(h.figure ? { figure: h.figure } : {}),
                },
              });
            }
          }
        }
      }
      if (active && request === token) {
        setEntries(rows);
        setLoading(false);
        setError('');
      }
    }
    const refresh = () => {
      void load().catch((err: unknown) => {
        if (active) {
          setError(String(err));
          setLoading(false);
        }
      });
    };
    const sub = ctx.vault.watch((change) => {
      if (
        change.paths.some(
          (p) => p.endsWith('.md') || p.endsWith('.annot.json') || p.endsWith('.pdf'),
        )
      )
        refresh();
    });
    refresh();
    return () => {
      active = false;
      sub.dispose();
    };
  }, [ctx]);
  return { entries, error, loading };
}

export function EvidenceShelf({ ctx, library }: { ctx: ModuleContext; library: LibraryState }) {
  const { entries, error } = useEvidence(ctx);
  const [sort, setSort] = useState<EvidenceSort>('source');
  const [subject, setSubject] = useState('');
  const [sending, setSending] = useState('');
  const snapshot = useSyncExternalStore(library.subscribe, library.current);
  const subjects = new Map<string, string>();
  for (const entry of entries)
    for (const tag of entry.subjects) subjects.set(tag.toLocaleLowerCase(), tag);
  const visible = sortEvidence(
    entries.filter(
      (e) =>
        !subject ||
        (subject === '*'
          ? !e.subjects.length
          : e.subjects.some((t) => t.toLocaleLowerCase() === subject)),
    ),
    sort,
  );
  return (
    <section aria-label="Evidence and comments">
      <h2>Evidence and comments</h2>
      <label>
        Subject{' '}
        <select
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
          }}
        >
          <option value="">All subjects</option>
          <option value="*">Unfiled</option>
          {[...subjects.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
        </select>
      </label>
      <label>
        Sort evidence{' '}
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as EvidenceSort);
          }}
        >
          <option value="source">Paper and page</option>
          <option value="title">Title</option>
          <option value="subject">Subject</option>
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {visible.length === 0 && <p>No evidence filed here yet.</p>}
      {visible.map((e) => {
        const ref = snapshot.refs.get(e.citekey);
        return (
          <article className="reading-capture" key={e.path}>
            <h3>{e.title}</h3>
            {e.subjects.length > 0 && <small>{e.subjects.join(' · ')}</small>}
            {e.figure && <FigureImage ctx={ctx} path={e.figure} />}
            <blockquote>{e.excerpt}</blockquote>
            {e.comment && <p className="evidence-comment">{e.comment}</p>}
            <small>{ref ? fullReference(ref) : e.reference || e.citekey || e.source}</small>
            <div className="actions">
              <button
                type="button"
                onClick={() => {
                  setSending(sending === e.path ? '' : e.path);
                }}
              >
                Send to mind map
              </button>
              {sending === e.path && <SendToMap ctx={ctx} entry={e} />}
              <button
                type="button"
                onClick={() => void ctx.app.open(e.source, { heading: e.heading })}
                disabled={!e.source}
              >
                Open source · p. {e.heading.slice(5).split('&')[0]}
              </button>
              <button
                type="button"
                onClick={() =>
                  void (e.capture
                    ? ctx.app.openView(READING, JSON.stringify(e.capture))
                    : ctx.app.open(e.path))
                }
              >
                {e.capture ? 'Add subjects or comment' : 'Edit evidence note'}
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
