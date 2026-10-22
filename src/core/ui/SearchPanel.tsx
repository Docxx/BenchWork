import { useEffect, useRef } from 'react';
import { MATCH_END, MATCH_START } from '../platform';
import type { SearchResult } from '../state/appStore';
import { useApp } from './AppStoreContext';

/** The search box at the top of the sidebar. Ctrl+E jumps here. */
export function SearchBox() {
  const query = useApp((s) => s.searchQuery);
  const setQuery = useApp((s) => s.setSearchQuery);
  const clear = useApp((s) => s.clearSearch);
  const focusRequest = useApp((s) => s.searchFocusRequest);
  const progress = useApp((s) => s.indexProgress);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusRequest === 0) return;
    input.current?.focus();
    input.current?.select();
  }, [focusRequest]);

  return (
    <div className="search-box">
      <input
        ref={input}
        type="search"
        aria-label="Search pages"
        placeholder="Search (Ctrl+E)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            clear();
            input.current?.blur();
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            document.querySelector<HTMLElement>('.search-result')?.focus();
          }
        }}
      />
      {progress.state === 'indexing' && progress.total > 0 && (
        <p className="search-status" role="status">
          Indexing {progress.done} of {progress.total} pages
        </p>
      )}
      {progress.state === 'error' && (
        <p className="search-status error" role="alert">
          Search is not available. {progress.error}
        </p>
      )}
    </div>
  );
}

/** Text with matched words highlighted. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(MATCH_START);
  return (
    <p className="search-snippet">
      {parts.map((part, i) => {
        if (i === 0) return part;
        const end = part.indexOf(MATCH_END);
        if (end === -1) return part;
        return (
          <span key={i}>
            <mark>{part.slice(0, end)}</mark>
            {part.slice(end + 1)}
          </span>
        );
      })}
    </p>
  );
}

/** Pages matching the search, shown in place of the notebook list. */
export function SearchResults({ results }: { results: SearchResult[] }) {
  const openPage = useApp((s) => s.openPage);
  const showView = useApp((s) => s.showView);
  const openPath = useApp((s) => s.page?.path ?? null);

  if (results.length === 0) return <p className="search-empty">No pages found.</p>;

  return (
    <ul className="search-results" aria-label="Search results">
      {results.map((result) => (
        <li key={result.path}>
          <button
            type="button"
            className={result.path === openPath ? 'search-result active' : 'search-result'}
            aria-current={result.path === openPath ? 'page' : undefined}
            onClick={() => {
              showView('files');
              void openPage(result.path);
            }}
            onKeyDown={(e) => {
              const item = e.currentTarget.parentElement;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                item?.nextElementSibling?.querySelector<HTMLElement>('button')?.focus();
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const previous = item?.previousElementSibling?.querySelector<HTMLElement>('button');
                (previous ?? document.querySelector<HTMLElement>('.search-box input'))?.focus();
              }
            }}
          >
            <span className="search-title">{result.title}</span>
            {result.location !== '' && <span className="search-location">{result.location}</span>}
            {result.snippet !== '' && <Snippet text={result.snippet} />}
          </button>
        </li>
      ))}
    </ul>
  );
}
