import { useEffect, useState, type ReactNode } from 'react';
import type { ModuleContext } from '@core/api';
import {
  label,
  link,
  loadEntries,
  readEntry,
  relatedEntries,
  saveEntry,
  text,
  useEntries,
  values,
  type Entry,
} from './api';
import './workflows.css';

export interface Field {
  key: string;
  label: string;
  kind?:
    'text' | 'long' | 'list' | 'date' | 'datetime-local' | 'number' | 'choice' | 'link' | 'links';
  options?: readonly string[];
  types?: readonly string[];
  required?: boolean;
  readOnly?: boolean;
  createOnly?: boolean;
}
export interface RecordSpec {
  kind: string;
  title: string;
  singular: string;
  folder: string;
  fields: readonly Field[];
  defaults?: Record<string, unknown> | (() => Record<string, unknown>);
  page?: boolean;
  viewId?: string;
  validate?: (
    data: Record<string, unknown>,
    entries: Entry[],
    current: Entry | null,
  ) => string | null | Promise<string | null>;
  suggest?: (
    data: Record<string, unknown>,
    entries: Entry[],
    current: Entry | null,
  ) => Promise<Record<string, unknown>>;
}

export function LinkPicker({
  field,
  value,
  entries,
  onChange,
}: {
  field: Field;
  value: unknown;
  entries: Entry[];
  onChange: (value: unknown) => void;
}) {
  const chosen = values(value);
  return (
    <div className="workflow-links">
      <select
        aria-label={field.label}
        value=""
        onChange={(e) => {
          if (e.target.value !== '')
            onChange(
              field.kind === 'links'
                ? [...new Set([...chosen, link(e.target.value)])]
                : link(e.target.value),
            );
        }}
      >
        <option value="">Choose {field.label.toLowerCase()}…</option>
        {entries
          .filter((e) => e.error === null && (!field.types || field.types.includes(e.type)))
          .map((e) => (
            <option key={e.path} value={e.path}>
              {e.title} · {e.path}
            </option>
          ))}
      </select>
      {chosen.map((v) => (
        <span className="workflow-chip" key={v}>
          {label(v)}
          <button
            type="button"
            aria-label={`Remove ${label(v)}`}
            onClick={() => {
              onChange(field.kind === 'links' ? chosen.filter((c) => c !== v) : '');
            }}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

export function RecordEditor({
  ctx,
  spec,
  entry,
  entries,
  onSaved,
  onCancel,
}: {
  ctx: ModuleContext;
  spec: RecordSpec;
  entry: Entry | null;
  entries: Entry[];
  onSaved: (path: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(entry?.title ?? '');
  const [data, setData] = useState<Record<string, unknown>>(
    entry?.data ?? { ...(typeof spec.defaults === 'function' ? spec.defaults() : spec.defaults) },
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key: string, value: unknown) => {
    setData((old) => ({ ...old, [key]: value }));
  };
  return (
    <form
      className="workflow-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        void (async () => {
          const problem = await spec.validate?.(data, await loadEntries(ctx), entry);
          if (problem) throw new Error(problem);
          if (entry) {
            const changes = Object.fromEntries(
              spec.fields
                .filter((f) => !f.createOnly && !f.readOnly)
                .map((f) => [f.key, data[f.key] ?? '']),
            );
            await saveEntry(ctx, entry, changes);
            onSaved(entry.path);
          } else {
            const safe = name
              .trim()
              .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '-')
              .replace(/[. ]+$/, '');
            if (!safe) throw new Error('Enter a name.');
            await ctx.vault.ensureDir(spec.folder);
            const path = spec.page
              ? await ctx.app.createPage(spec.folder, safe, spec.kind, {
                  properties: { ...data },
                  body: '## Notes\n\n',
                })
              : await ctx.vault.createRecord(spec.folder, safe, spec.kind, data);
            if (path === null) throw new Error('The page could not be created.');
            if (spec.page && spec.viewId) await ctx.app.openView(spec.viewId, path);
            onSaved(path);
          }
        })()
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : String(err));
          })
          .finally(() => {
            setBusy(false);
          });
      }}
    >
      <h2>{entry ? `Edit ${spec.singular}` : `New ${spec.singular}`}</h2>
      {!entry && (
        <label>
          Name
          <input
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
          />
        </label>
      )}
      {spec.fields
        .filter((f) => !entry || !f.createOnly)
        .map((field) => (
          <label key={field.key}>
            {field.label}
            {field.kind === 'link' || field.kind === 'links' ? (
              <LinkPicker
                field={field}
                value={data[field.key]}
                entries={entries.filter((e) => e.path !== entry?.path)}
                onChange={(v) => {
                  set(field.key, v);
                }}
              />
            ) : field.kind === 'choice' ? (
              <select
                value={text(data[field.key])}
                required={field.required}
                onChange={(e) => {
                  set(field.key, e.target.value);
                }}
              >
                <option value="">Choose…</option>
                {field.options?.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : field.kind === 'long' || field.kind === 'list' ? (
              <textarea
                rows={4}
                value={
                  Array.isArray(data[field.key])
                    ? values(data[field.key]).join('\n')
                    : text(data[field.key])
                }
                required={field.required}
                onChange={(e) => {
                  set(
                    field.key,
                    field.kind === 'list'
                      ? e.target.value.split(/\r?\n/).filter((v) => v.trim() !== '')
                      : e.target.value,
                  );
                }}
              />
            ) : (
              <input
                disabled={Boolean(entry && field.readOnly)}
                type={field.kind ?? 'text'}
                required={field.required}
                value={
                  field.kind === 'number'
                    ? typeof data[field.key] === 'number'
                      ? String(data[field.key])
                      : ''
                    : text(data[field.key])
                }
                onChange={(e) => {
                  set(
                    field.key,
                    field.kind === 'number'
                      ? e.target.value === ''
                        ? null
                        : Number(e.target.value)
                      : e.target.value,
                  );
                }}
              />
            )}
          </label>
        ))}
      {error && <p role="alert">{error}</p>}
      <div className="actions">
        {spec.suggest && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void spec
                .suggest?.(data, entries, entry)
                .then((changes) => {
                  setData((old) => ({ ...old, ...changes }));
                  setError('Suggested times filled in. Review them before saving.');
                })
                .catch((err: unknown) => {
                  setError(String(err));
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
          >
            Suggest available time
          </button>
        )}
        <button
          disabled={busy || (entry?.error !== undefined && entry.error !== null)}
          type="submit"
        >
          {busy ? 'Saving…' : 'Save record'}
        </button>
        <button disabled={busy} className="quiet" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function LinkedRecords({
  ctx,
  entry,
  entries,
}: {
  ctx: ModuleContext;
  entry: Entry;
  entries: Entry[];
}) {
  const [linked, setLinked] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void relatedEntries(ctx, entry, entries)
      .then((items) => {
        if (active) {
          setLinked(items);
          setError('');
        }
      })
      .catch((err: unknown) => {
        if (active) setError(String(err));
      });
    return () => {
      active = false;
    };
  }, [ctx, entry, entries]);
  return (
    <section aria-label="Connected records">
      <h3>Connected records</h3>
      {error && <p role="alert">{error}</p>}
      {linked.length === 0 ? (
        <p className="hint">
          Link experiments, samples, notes or data to bring them together here.
        </p>
      ) : (
        <ul className="workflow-related">
          {linked.map((item) => (
            <li key={item.path}>
              <button
                type="button"
                className="link-button"
                onClick={() => void ctx.app.open(item.path)}
              >
                {item.title}
              </button>
              <span className="hint">{item.type}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function RecordsView({
  ctx,
  spec,
  initial,
  detail,
}: {
  ctx: ModuleContext;
  spec: RecordSpec;
  initial?: string | null;
  detail?: (entry: Entry, entries: Entry[], refresh: () => void) => ReactNode;
}) {
  const { entries, error, loading, refresh } = useEntries(ctx);
  const [selected, setSelected] = useState(initial ?? '');
  const [edit, setEdit] = useState<'new' | 'edit' | null>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [query, setQuery] = useState('');
  const entry = entries.find((e) => e.path === selected) ?? null;
  const shown = entries.filter(
    (e) =>
      e.type === spec.kind &&
      `${e.title} ${JSON.stringify(e.data)}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="workflow-workspace">
      <aside aria-label={`${spec.title} list`}>
        <div className="workflow-toolbar">
          <input
            type="search"
            aria-label={`Find ${spec.title.toLowerCase()}`}
            placeholder="Find…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
          />
          <button
            disabled={edit !== null}
            onClick={() => {
              setEditingEntry(null);
              setEdit('new');
            }}
          >
            New {spec.singular}
          </button>
        </div>
        {loading && <p>Reading…</p>}
        {error && <p role="alert">{error}</p>}
        {shown.map((item) => (
          <button
            className="workflow-list-item"
            key={item.path}
            disabled={edit !== null}
            aria-pressed={item.path === selected}
            onClick={() => {
              setSelected(item.path);
            }}
          >
            <strong>{item.title}</strong>
            <span>{label(item.data['status']) || label(item.data['experiment']) || item.path}</span>
          </button>
        ))}
        {!loading && shown.length === 0 && (
          <p className="hint">No {spec.title.toLowerCase()} yet.</p>
        )}
      </aside>
      <section className="workflow-detail">
        {edit !== null ? (
          <RecordEditor
            key={edit + selected}
            ctx={ctx}
            spec={spec}
            entry={editingEntry}
            entries={entries}
            onCancel={() => {
              setEdit(null);
            }}
            onSaved={(path) => {
              setSelected(path);
              setEdit(null);
              refresh();
            }}
          />
        ) : entry ? (
          <>
            <header className="workflow-toolbar">
              <h2>{entry.title}</h2>
              <button
                onClick={() => {
                  void readEntry(ctx, entry)
                    .then((fresh) => {
                      setEditingEntry(fresh);
                      setEdit('edit');
                    })
                    .catch((err: unknown) => {
                      ctx.app.notify(String(err));
                    });
                }}
              >
                Edit details
              </button>
              <button className="quiet" onClick={() => void ctx.app.open(entry.path)}>
                Open file
              </button>
            </header>
            {entry.error ? (
              <p role="alert">{entry.error}</p>
            ) : (
              <>
                <dl className="workflow-summary">
                  {spec.fields
                    .filter(
                      (f) =>
                        values(entry.data[f.key]).length > 0 ||
                        typeof entry.data[f.key] === 'number',
                    )
                    .map((f) => (
                      <div key={f.key}>
                        <dt>{f.label}</dt>
                        <dd>
                          {label(entry.data[f.key]) ||
                            (typeof entry.data[f.key] === 'number'
                              ? String(entry.data[f.key])
                              : '')}
                        </dd>
                      </div>
                    ))}
                </dl>
                {detail?.(entry, entries, refresh)}
                <LinkedRecords ctx={ctx} entry={entry} entries={entries} />
              </>
            )}
          </>
        ) : (
          <div className="workflow-empty">
            <h2>{spec.title}</h2>
            <p>Choose a record, or create one to get started. Everything stays in your vault.</p>
          </div>
        )}
      </section>
    </div>
  );
}
