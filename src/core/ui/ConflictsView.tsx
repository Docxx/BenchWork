import { useEffect, useState } from 'react';
import { pageTitle } from '../notebooks/notebookTree';
import { baseName } from '../platform';
import type { ConflictChoice } from '../state/syncSlice';
import { lineDiff, type ConflictCopy, type DiffLine } from '../sync/conflicts';
import { useApp } from './AppStoreContext';

/** When a copy was made, as people read it. */
function madeAt(when: Date): string {
  return when.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** One side of the comparison: the lines it has, with those only it has marked. */
function Side({ title, lines, own }: { title: string; lines: DiffLine[]; own: DiffLine['kind'] }) {
  return (
    <section className="diff-side" aria-label={title}>
      <h2>{title}</h2>
      <pre>
        {lines
          .filter((l) => l.kind === 'same' || l.kind === own)
          .map((l, i) => (
            <span key={i} className={l.kind === 'same' ? 'diff-line' : 'diff-line changed'}>
              {l.text === '' ? ' ' : l.text}
              {'\n'}
            </span>
          ))}
      </pre>
    </section>
  );
}

/** A page that changed on two devices: both copies side by side, and a choice. */
function Conflict({ conflict }: { conflict: ConflictCopy }) {
  const readConflict = useApp((s) => s.readConflict);
  const resolveConflict = useApp((s) => s.resolveConflict);
  const openPage = useApp((s) => s.openPage);
  const showView = useApp((s) => s.showView);
  const [lines, setLines] = useState<DiffLine[] | null>(null);
  const [unreadable, setUnreadable] = useState(false);

  useEffect(() => {
    let live = true;
    void readConflict(conflict.copy).then((texts) => {
      if (!live) return;
      if (texts === null) setUnreadable(true);
      else setLines(lineDiff(texts.current ?? '', texts.other));
    });
    return () => {
      live = false;
    };
  }, [conflict.copy, readConflict]);

  const choose = (choice: ConflictChoice) => void resolveConflict(conflict.copy, choice);
  const name = pageTitle(baseName(conflict.original));

  return (
    <article className="conflict" aria-label={name}>
      <header>
        <h2>{name}</h2>
        <p className="hint">
          Changed on another device ({conflict.device}) before the two synced. Its copy is from{' '}
          {madeAt(conflict.when)}.
        </p>
      </header>
      {unreadable && <p className="notice">The other copy could not be read.</p>}
      {lines !== null && (
        <div className="diff">
          <Side title="This page" lines={lines} own="mine" />
          <Side title="The other copy" lines={lines} own="theirs" />
        </div>
      )}
      <div className="actions">
        <button
          type="button"
          onClick={() => {
            choose('current');
          }}
        >
          Keep this page
        </button>
        <button
          type="button"
          onClick={() => {
            choose('other');
          }}
        >
          Use the other copy
        </button>
        <button
          type="button"
          onClick={() => {
            choose('both');
          }}
        >
          Keep both
        </button>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            showView('files');
            void openPage(conflict.original);
          }}
        >
          Open this page to merge by hand
        </button>
      </div>
    </article>
  );
}

/**
 * Pages that changed on two devices before they synced. Each shows both
 * copies; the person keeps one, or both. Drawings never come here: they
 * merge by themselves.
 */
export function ConflictsView() {
  const conflicts = useApp((s) => s.conflicts);
  const error = useApp((s) => s.conflictError);
  const showView = useApp((s) => s.showView);

  return (
    <div className="conflicts-view">
      <h1>Differences</h1>
      <p className="hint">
        These pages were changed on two devices before they synced, so both versions were kept.
        Choose which to keep. Whatever you do not keep goes to the Recycle Bin.
      </p>
      {error !== null && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {conflicts.length === 0 ? (
        <>
          <p>Nothing left to settle.</p>
          <button
            type="button"
            onClick={() => {
              showView('files');
            }}
          >
            Back to pages
          </button>
        </>
      ) : (
        conflicts.map((c) => <Conflict key={c.copy} conflict={c} />)
      )}
    </div>
  );
}
