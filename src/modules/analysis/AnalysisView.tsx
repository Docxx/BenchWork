import { useEffect, useState } from 'react';
import type { ModuleContext, VaultItem } from '@core/api';
import { datasetName, type AnalysisSession, type RunOutcome } from './run';
import { RunHistory } from './RunHistory';
import { newScript, parseScripts, type Script } from './scripts';
import { ScriptForm } from './ScriptForm';

const STORE = 'scripts.json';

/** Runs the person's scripts on datasets, and keeps their results with them. */
export function AnalysisView({
  ctx,
  dataset: given,
  session,
}: {
  ctx: ModuleContext;
  dataset: string | null;
  session: AnalysisSession;
}) {
  const [scripts, setScripts] = useState<Script[] | null>(null);
  const [datasets, setDatasets] = useState<VaultItem[]>([]);
  const [dataset, setDataset] = useState(session.current()?.dataset ?? given ?? '');
  const [scriptId, setScriptId] = useState('');
  const [running, setRunning] = useState<string | null>(session.current()?.id ?? null);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [parameters, setParameters] = useState<Record<string, string>>({});
  useEffect(() => {
    const active = session.current();
    if (!active) return;
    let live = true;
    void active.pending
      .then((value) => {
        if (live) setOutcome(value);
      })
      .catch((err: unknown) => {
        if (live) setError(String(err));
      })
      .finally(() => {
        if (live) setRunning(null);
      });
    return () => {
      live = false;
    };
  }, [session]);

  useEffect(() => {
    void ctx.storage.read(STORE).then((data) => {
      const list = parseScripts(data);
      setScripts(list);
      setScriptId((id) => id || (list[0]?.id ?? ''));
    });
    void ctx.app.items().then((items) => {
      setDatasets(items.filter((i) => i.type === 'dataset'));
    });
  }, [ctx]);

  const save = async (next: Script[]) => {
    setScripts(next);
    await ctx.storage.write(STORE, next);
  };

  if (scripts === null) return <p className="hint">Reading…</p>;
  if (!ctx.programs)
    return (
      <>
        <p className="notice">Run Python and R on a computer. Saved history is available here.</p>
        <RunHistory ctx={ctx} refresh={outcome} />
      </>
    );

  const script = scripts.find((s) => s.id === scriptId);
  const run = async () => {
    if (!script || dataset === '') return;
    const id = Math.random().toString(36).slice(2);
    setRunning(id);
    setOutcome(null);
    setError(null);
    try {
      setOutcome(await session.run(script, dataset, id, { ...script.parameters, ...parameters }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="analysis-view">
      <section aria-label="Run a script">
        <div className="analysis-run">
          <label className="label">
            Dataset
            <select
              value={dataset}
              onChange={(e) => {
                setDataset(e.target.value);
              }}
            >
              <option value="">Choose a dataset</option>
              {datasets.map((d) => (
                <option key={d.path} value={d.path}>
                  {datasetName(d.path)}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Script
            <select
              value={scriptId}
              onChange={(e) => {
                setScriptId(e.target.value);
                setParameters({});
              }}
            >
              {scripts.length === 0 && <option value="">Add a script below</option>}
              {scripts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.script || 'Unnamed script'}
                </option>
              ))}
            </select>
          </label>
          {Object.entries(script?.parameters ?? {}).map(([key, value]) => (
            <label className="label" key={key}>
              {key}
              <input
                value={parameters[key] ?? value}
                onChange={(e) => {
                  setParameters({ ...parameters, [key]: e.target.value });
                }}
              />
            </label>
          ))}
          {running === null ? (
            <button type="button" disabled={!script || dataset === ''} onClick={() => void run()}>
              Run
            </button>
          ) : (
            <button type="button" onClick={() => void session.stop(running)}>
              Stop
            </button>
          )}
        </div>
        {running !== null && <p className="hint">Running…</p>}
        {error !== null && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}
        {outcome !== null && (
          <div className="analysis-result" role="status">
            <p>
              {outcome.result.stopped
                ? 'Stopped.'
                : outcome.result.code === 0
                  ? 'Finished.'
                  : `Finished with exit code ${String(outcome.result.code)}.`}{' '}
              Results are in{' '}
              <button
                type="button"
                className="quiet"
                onClick={() => void ctx.app.open(`${outcome.folder}/run.log`)}
              >
                {outcome.folder}
              </button>
              , and listed on the dataset.
            </p>
            {outcome.outputs.length > 0 && (
              <ul aria-label="Results">
                {outcome.outputs.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => void ctx.app.open(`${outcome.folder}/${name}`)}
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {outcome.result.stderr.trim() !== '' && (
              <pre className="analysis-output">
                {outcome.result.stderr.trim().split('\n').slice(-20).join('\n')}
              </pre>
            )}
          </div>
        )}
      </section>

      <section aria-label="Scripts">
        <h2>Scripts</h2>
        <p className="hint">
          Your own scripts, run with Python, R or another installed executable. Results go in a new
          folder beside the dataset. Run records capture hashes and a copy of the main script.
        </p>
        {scripts.map((s) =>
          editing === s.id ? (
            <ScriptForm
              key={s.id}
              ctx={ctx}
              script={s}
              onSave={(next) => {
                void save(scripts.map((x) => (x.id === s.id ? next : x)));
                setEditing(null);
              }}
              onRemove={() => {
                void save(scripts.filter((x) => x.id !== s.id));
                setEditing(null);
              }}
            />
          ) : (
            <div key={s.id} className="analysis-script-row">
              <span>{s.name || 'Unnamed script'}</span>
              <span className="hint">{s.script}</span>
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setEditing(s.id);
                }}
              >
                Edit
              </button>
            </div>
          ),
        )}
        <button
          type="button"
          onClick={() => {
            const s = newScript();
            void save([...scripts, s]);
            setEditing(s.id);
            if (scriptId === '') setScriptId(s.id);
          }}
        >
          Add a script
        </button>
      </section>
      <RunHistory ctx={ctx} refresh={outcome ?? error} />
    </div>
  );
}
