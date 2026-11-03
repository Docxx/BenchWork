import { useCallback, useEffect, useState } from 'react';
import type { ModuleContext, VaultItem } from '@core/api';

export function RunHistory({ ctx, refresh }: { ctx: ModuleContext; refresh: unknown }) {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(
    () =>
      ctx.app
        .items()
        .then((all) => {
          setItems(
            all.filter((i) => i.type === 'analysis').sort((a, b) => b.path.localeCompare(a.path)),
          );
        })
        .catch((err: unknown) => {
          setError(String(err));
        }),
    [ctx],
  );
  useEffect(() => {
    void load();
  }, [load, refresh]);
  return (
    <section aria-label="Run history">
      <h2>Run history</h2>
      <p className="hint">
        Saved inputs, script snapshot, parameters, runtime, logs and outputs. Runs made on a
        computer can be reviewed on the tablet.
      </p>
      <button type="button" className="quiet" onClick={() => void load()}>
        Refresh history
      </button>
      {error && <p role="alert">{error}</p>}
      {items.length === 0 && <p className="hint">No saved runs yet.</p>}
      {items.map((item) => (
        <button
          className="analysis-history-item quiet"
          key={item.path}
          type="button"
          onClick={() => void ctx.app.openView('analysis.run', item.path)}
        >
          {item.title}
          <small>{item.path}</small>
        </button>
      ))}
    </section>
  );
}

export function RunDetails({ ctx, path }: { ctx: ModuleContext; path: string | null }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    void ctx.vault
      .readRecord(path)
      .then((record) => {
        if (record.error !== null) setError(record.error);
        else setData(record.data);
      })
      .catch((err: unknown) => {
        setError(String(err));
      });
  }, [ctx, path]);
  if (error) return <p role="alert">{error}</p>;
  if (!data || !path) return <p className="hint">Reading run…</p>;
  const text = (key: string) => (typeof data[key] === 'string' ? data[key] : '');
  const openLink = (key: string) => {
    const target = /^\[\[(.*?)\]\]$/.exec(text(key))?.[1];
    if (target) void ctx.app.open(target);
  };
  const outputs = Array.isArray(data['outputs'])
    ? (data['outputs'] as { path?: string; sha256?: string }[])
    : [];
  return (
    <article className="analysis-run-details">
      <h2>{text('title')}</h2>
      <p>
        Status: <strong>{text('status')}</strong> · {text('started')}
      </p>
      {text('error') && <p role="alert">{text('error')}</p>}
      <div className="actions">
        <button
          type="button"
          onClick={() => {
            openLink('dataset');
          }}
        >
          Open dataset
        </button>
        <button
          type="button"
          onClick={() => {
            openLink('snapshot');
          }}
        >
          Script snapshot
        </button>
        <button
          type="button"
          onClick={() => {
            openLink('log');
          }}
        >
          Run log
        </button>
        <button type="button" className="quiet" onClick={() => void ctx.app.open(path)}>
          Full run record
        </button>
      </div>
      <h3>Runtime</h3>
      <pre>{text('runtime') || 'Not available'}</pre>
      <h3>Parameters</h3>
      <pre>{JSON.stringify(data['parameters'] ?? {}, null, 2)}</pre>
      <h3>Results</h3>
      {outputs.length === 0 && <p className="hint">No output files were recorded.</p>}
      {outputs
        .filter((o) => typeof o.path === 'string')
        .map((o) => (
          <button
            type="button"
            className="analysis-history-item quiet"
            key={o.path}
            onClick={() => void ctx.app.open(o.path ?? '')}
          >
            {o.path}
            <small>SHA-256 {o.sha256}</small>
          </button>
        ))}
      {data['scriptChanged'] === true && (
        <p className="notice">
          The original script changed during the run. The snapshot may not match every instruction
          executed.
        </p>
      )}
      <p className="hint">{text('scope')}</p>
    </article>
  );
}
