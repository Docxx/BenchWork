import { useId, useState } from 'react';
import type { ModuleContext } from '@core/api';
import { DAYS, shortAuthors, type Paper, type Topic } from './europePmc';
import { newestPapers, usePapers, type PapersStore } from './store';

function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ago(ms: number, now = Date.now()): string {
  const minutes = Math.round((now - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${String(minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${String(hours)} ${hours === 1 ? 'hour' : 'hours'} ago`;
  return dayLabel(new Date(ms).toISOString().slice(0, 10));
}

function PaperItem({
  ctx,
  store,
  paper,
  topic,
  compact = false,
}: {
  ctx: ModuleContext;
  store: PapersStore;
  paper: Paper;
  topic: Topic | null;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const abstractId = useId();
  return (
    <li className="paper" aria-label={paper.title}>
      <button
        type="button"
        className="paper-title"
        aria-expanded={compact ? undefined : open}
        aria-controls={compact ? undefined : abstractId}
        onClick={() => {
          if (compact) void ctx.web.open(paper.url);
          else setOpen((o) => !o);
        }}
      >
        {paper.title}
      </button>
      <span className="paper-meta">
        {shortAuthors(paper.authors)}
        {paper.journal !== '' && <> · {paper.journal}</>} · {dayLabel(paper.date)}
        {paper.preprint && <span className="paper-badge">Preprint</span>}
        {paper.openAccess && <span className="paper-badge">Open access</span>}
        {compact && topic !== null && <span className="paper-topic">{topic.name}</span>}
      </span>
      {!compact && open && (
        <div id={abstractId} className="paper-abstract">
          {paper.abstract === '' ? (
            <p className="hint">No abstract.</p>
          ) : (
            paper.abstract.split('\n').map((p, i) => <p key={i}>{p}</p>)
          )}
        </div>
      )}
      {!compact && (
        <span className="paper-tools">
          <button type="button" className="quiet" onClick={() => void ctx.web.open(paper.url)}>
            Open
          </button>
          {paper.doi !== null && (
            <button
              type="button"
              className="quiet"
              onClick={() => void ctx.web.open(`https://doi.org/${paper.doi ?? ''}`)}
            >
              Journal page
            </button>
          )}
          <button type="button" className="quiet" onClick={() => void store.makeNote(paper, topic)}>
            Make a note
          </button>
        </span>
      )}
    </li>
  );
}

function TopicForm({
  topic,
  onSave,
  onCancel,
}: {
  topic: Topic | null;
  onSave: (topic: Topic) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(topic?.name ?? '');
  const [query, setQuery] = useState(topic?.query ?? '');
  const [preprints, setPreprints] = useState(topic?.preprints ?? true);
  const id = useId();
  return (
    <form
      className="paper-topic-form"
      aria-label={topic === null ? 'New topic' : `Change ${topic.name}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (query.trim() === '') return;
        onSave({
          id: topic?.id ?? crypto.randomUUID().slice(0, 8),
          name: name.trim() === '' ? query.trim() : name.trim(),
          query: query.trim(),
          preprints,
        });
      }}
    >
      <label htmlFor={`${id}-name`}>Name</label>
      <input
        id={`${id}-name`}
        value={name}
        placeholder="Tau in flies"
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
      <label htmlFor={`${id}-query`}>Search words</label>
      <input
        id={`${id}-query`}
        value={query}
        placeholder="tau AND (Drosophila OR fly)"
        onChange={(e) => {
          setQuery(e.target.value);
        }}
      />
      <p className="hint">
        Use AND, OR and NOT, brackets, and "quotes" for a phrase. AUTH:"Smith J" finds an author.
      </p>
      <label className="paper-check">
        <input
          type="checkbox"
          checked={preprints}
          onChange={(e) => {
            setPreprints(e.target.checked);
          }}
        />
        Include preprints
      </label>
      <span className="paper-form-buttons">
        <button type="submit" disabled={query.trim() === ''}>
          {topic === null ? 'Add topic' : 'Save'}
        </button>
        <button type="button" className="quiet" onClick={onCancel}>
          Cancel
        </button>
      </span>
    </form>
  );
}

/** Topics down the side, and the chosen topic's newest papers. */
export function PapersView({ ctx, store }: { ctx: ModuleContext; store: PapersStore }) {
  const state = usePapers(store);
  const [chosen, setChosen] = useState<string | null>(null);
  /** 'new', or the id of the topic being changed. */
  const [editing, setEditing] = useState<string | null>(null);
  const topic = state.topics.find((t) => t.id === chosen) ?? state.topics[0] ?? null;

  if (!state.loaded) return <p className="hint">Reading your topics…</p>;

  const form =
    editing === null ? null : (
      <TopicForm
        key={editing}
        topic={editing === 'new' ? null : (state.topics.find((t) => t.id === editing) ?? null)}
        onSave={(t) => {
          setEditing(null);
          setChosen(t.id);
          void store.saveTopic(t);
        }}
        onCancel={() => {
          setEditing(null);
        }}
      />
    );

  if (state.topics.length === 0) {
    return (
      <div className="papers-empty">
        <p>
          Follow a topic to see its newest papers from Europe PMC, which covers PubMed and preprints
          from bioRxiv and medRxiv.
        </p>
        {form ?? (
          <button
            type="button"
            onClick={() => {
              setEditing('new');
            }}
          >
            Follow a topic
          </button>
        )}
      </div>
    );
  }

  const results = topic === null ? undefined : state.results[topic.id];
  const loading = topic !== null && state.loading.includes(topic.id);
  const error = topic === null ? undefined : state.errors[topic.id];

  return (
    <div className="papers">
      <nav className="papers-topics" aria-label="Topics">
        {state.topics.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={t.id === topic?.id}
            onClick={() => {
              setChosen(t.id);
              setEditing(null);
            }}
          >
            {t.name}
            <span className="nav-count">{state.results[t.id]?.papers.length ?? ''}</span>
          </button>
        ))}
        <button
          type="button"
          className="quiet"
          onClick={() => {
            setEditing('new');
          }}
        >
          + Follow a topic
        </button>
      </nav>

      <section className="papers-list" aria-label={topic?.name ?? 'Papers'}>
        {form}
        {topic !== null && editing === null && (
          <>
            <header className="papers-head">
              <div>
                <h2>{topic.name}</h2>
                <p className="hint">
                  {topic.query} · last {DAYS} days{topic.preprints ? ', with preprints' : ''}
                  {results && <> · updated {ago(results.fetched)}</>}
                </p>
              </div>
              <span className="papers-head-tools">
                <button
                  type="button"
                  className="quiet"
                  disabled={loading}
                  onClick={() => void store.refresh(topic.id)}
                >
                  {loading ? 'Looking…' : 'Refresh'}
                </button>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => {
                    setEditing(topic.id);
                  }}
                >
                  Change
                </button>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => {
                    setChosen(null);
                    void store.removeTopic(topic.id);
                  }}
                >
                  Stop following
                </button>
              </span>
            </header>
            {error !== undefined && (
              <p className="notice" role="alert">
                {error}
              </p>
            )}
            {results === undefined ? (
              loading && <p className="hint">Looking for papers…</p>
            ) : results.papers.length === 0 ? (
              <p className="hint">No papers in the last {DAYS} days. Try wider search words.</p>
            ) : (
              <ul className="paper-list">
                {results.papers.map((p) => (
                  <PaperItem key={p.key} ctx={ctx} store={store} paper={p} topic={topic} />
                ))}
              </ul>
            )}
            <p className="hint papers-source">From Europe PMC. Open shows the paper there.</p>
          </>
        )}
      </section>
    </div>
  );
}

/** For Home: the newest papers across every topic. */
export function PapersCard({
  ctx,
  store,
  onOpen,
}: {
  ctx: ModuleContext;
  store: PapersStore;
  onOpen: () => void;
}) {
  const state = usePapers(store);
  const newest = newestPapers(state, 5);
  if (!state.loaded) return <p className="hint">Reading…</p>;
  return (
    <div className="papers-card">
      {state.topics.length === 0 ? (
        <p className="hint">Follow a topic to see its newest papers here.</p>
      ) : newest.length === 0 ? (
        <p className="hint">
          {state.loading.length > 0 ? 'Looking for papers…' : 'No new papers yet.'}
        </p>
      ) : (
        <ul className="paper-list">
          {newest.map(({ paper, topic }) => (
            <PaperItem
              key={paper.key}
              ctx={ctx}
              store={store}
              paper={paper}
              topic={topic}
              compact
            />
          ))}
        </ul>
      )}
      <button type="button" className="quiet" onClick={onOpen}>
        {state.topics.length === 0 ? 'Follow a topic' : 'All papers'}
      </button>
    </div>
  );
}
