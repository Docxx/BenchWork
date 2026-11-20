import { useEffect, useState } from 'react';
import type { ModuleContext } from '@core/api';
import { FigureImage, useEvidence, type Entry } from './EvidenceShelf';
import { linkedPaths } from '../manuscript/workspace';

export function DraftEvidence({ ctx, path }: { ctx: ModuleContext; path: string }) {
  const { entries, error } = useEvidence(ctx);
  const [links, setLinks] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let live = true;
    void ctx.app
      .pageProperties(path)
      .then((props) => {
        if (live) setLinks(linkedPaths(props?.['evidence']));
      })
      .catch((err: unknown) => {
        if (live) setMessage(String(err));
      });
    return () => {
      live = false;
    };
  }, [ctx, path]);
  const shown = entries.filter(
    (e) =>
      (all || query || links.includes(e.path)) &&
      [e.title, e.excerpt, e.citekey, ...e.subjects]
        .join(' ')
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  function insert(e: Entry, quote: boolean) {
    const page = e.heading.slice(5).split('&')[0] || '1';
    const fallback = e.reference
      ? '(' + e.reference + ', p. ' + page + ')'
      : '(' + e.source + ', p. ' + page + ')';
    const ok =
      ctx.app.openPage() === path &&
      ctx.app.insertText(
        (quote ? '“' + e.excerpt + '” ' : '') + (e.citekey ? '' : fallback),
        e.citekey ? '@' + e.citekey + ', p. ' + page : undefined,
      );
    setMessage(ok ? 'Inserted into draft.' : 'Click in the draft and try again.');
  }
  return (
    <details open>
      <summary>Draft evidence</summary>
      <input
        type="search"
        aria-label="Search evidence"
        placeholder="Search subject or highlight"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
      />
      <label>
        <input
          type="checkbox"
          checked={all}
          onChange={(e) => {
            setAll(e.target.checked);
          }}
        />{' '}
        All evidence
      </label>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!shown.length && <p>No matching evidence. Search your highlights or select All evidence.</p>}
      {shown.map((e) => (
        <article key={e.path}>
          <strong>{e.title}</strong>
          {e.figure && <FigureImage ctx={ctx} path={e.figure} />}
          <blockquote>{e.excerpt}</blockquote>
          <small>{e.citekey || e.reference || e.source}</small>
          <div className="actions">
            <button
              type="button"
              onClick={() => void ctx.app.open(e.source, { heading: e.heading })}
            >
              Open PDF · p. {e.heading.slice(5).split('&')[0]}
            </button>
            <button
              onMouseDown={(ev) => {
                ev.preventDefault();
              }}
              onClick={() => {
                insert(e, false);
              }}
            >
              Insert citation
            </button>
            <button
              onMouseDown={(ev) => {
                ev.preventDefault();
              }}
              onClick={() => {
                insert(e, true);
              }}
            >
              Insert quotation
            </button>
          </div>
        </article>
      ))}
    </details>
  );
}
