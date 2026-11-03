import { useState } from 'react';
import type { ModuleContext } from '@core/api';
import {
  addDays,
  blankStep,
  label,
  readEntry,
  RecordsView,
  saveEntry,
  stepsOf,
  text,
  today,
  useEntries,
  type Entry,
  type RecordSpec,
  type WorkflowStep,
} from '../research/api';
import {
  applySchedule,
  createRun,
  exportTasks,
  protocolSteps,
  repeatRun,
  reviewSchedule,
  type ScheduleReview,
} from './runs';

export const TEMPLATE: RecordSpec = {
  kind: 'workflowprotocol',
  title: 'Protocol templates',
  singular: 'protocol template',
  folder: 'Research/Protocols',
  defaults: { version: '1' },
  fields: [
    { key: 'purpose', label: 'Purpose', kind: 'long' },
    { key: 'version', label: 'Version' },
    {
      key: 'materials',
      label: 'Materials',
      kind: 'links',
      types: ['reagent', 'antibody', 'flystock', 'cross', 'equipment'],
    },
    {
      key: 'instructions',
      label: 'Instructions (one step per line)',
      kind: 'long',
      createOnly: true,
    },
    { key: 'notes', label: 'Notes', kind: 'long' },
  ],
};
export const RUN: RecordSpec = {
  kind: 'run',
  title: 'Runs',
  singular: 'run',
  folder: 'Research/Runs',
  defaults: () => ({ start: today(), status: 'planned', steps: [] }),
  fields: [
    { key: 'experiment', label: 'Experiment', kind: 'link', types: ['experiment'] },
    { key: 'protocol', label: 'Protocol', kind: 'link', types: ['protocol', 'workflowprotocol'] },
    { key: 'start', label: 'Start date', kind: 'date', required: true, readOnly: true },
    {
      key: 'status',
      label: 'Status',
      kind: 'choice',
      options: ['planned', 'running', 'done', 'stopped'],
    },
    { key: 'notes', label: 'Run notes', kind: 'long' },
  ],
};

function StepEditor({
  ctx,
  entry,
  refresh,
  isRun,
}: {
  ctx: ModuleContext;
  entry: Entry;
  refresh: () => void;
  isRun: boolean;
}) {
  const [base, setBase] = useState(entry);
  const [steps, setSteps] = useState<WorkflowStep[]>(
    isRun ? stepsOf(entry.data['steps']) : protocolSteps(entry),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = (id: string, values: Partial<WorkflowStep>) => {
    setSteps((old) => old.map((s) => (s.id === id ? { ...s, ...values } : s)));
  };
  const save = () => {
    setBusy(true);
    void saveEntry(ctx, base, {
      steps,
      status: isRun
        ? steps.length > 0 && steps.every((s) => s.done)
          ? 'done'
          : steps.some((s) => s.done)
            ? 'running'
            : (entry.data['status'] ?? 'planned')
        : (entry.data['status'] ?? 'Draft'),
    })
      .then(async () => {
        setBase(await readEntry(ctx, entry));
        refresh();
        setError('');
      })
      .catch((err: unknown) => {
        setError(String(err));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <section className="workflow-box" aria-label="Protocol steps">
      <h3>{isRun ? 'Bench checklist' : 'Reusable steps'}</h3>
      <p className="hint">
        Save steps to keep changes. Day offsets are relative to the run’s start date.
      </p>
      <ol className="workflow-steps">
        {steps.map((step, index) => (
          <li key={step.id} className={step.done ? 'workflow-step done' : 'workflow-step'}>
            <div className="workflow-step-head">
              {isRun && (
                <input
                  type="checkbox"
                  aria-label={`Complete ${step.title}`}
                  checked={step.done}
                  onChange={(e) => {
                    change(step.id, {
                      done: e.target.checked,
                      completedAt: e.target.checked ? new Date().toISOString() : null,
                    });
                  }}
                />
              )}
              <strong>
                {String(index + 1)}. {step.title}
              </strong>
              {isRun && <span>{addDays(text(entry.data['start']) || today(), step.offset)}</span>}
              {step.minutes > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (!ctx.timers.start(step.title, step.minutes * 60000))
                      ctx.app.notify('Enable Lab tools to use timers.');
                  }}
                >
                  Start {String(step.minutes)} min timer
                </button>
              )}
            </div>
            <div className="workflow-step-editor">
              <label>
                Step
                <input
                  value={step.title}
                  onChange={(e) => {
                    change(step.id, { title: e.target.value });
                  }}
                />
              </label>
              <label>
                Day offset
                <input
                  type="number"
                  value={step.offset}
                  onChange={(e) => {
                    change(step.id, { offset: Math.trunc(Number(e.target.value)) });
                  }}
                />
              </label>
              <label>
                Timer minutes
                <input
                  type="number"
                  min="0"
                  value={step.minutes}
                  onChange={(e) => {
                    change(step.id, { minutes: Math.max(0, Number(e.target.value)) });
                  }}
                />
              </label>
            </div>
            {isRun && (
              <label>
                Deviations and observations
                <textarea
                  value={step.notes}
                  onChange={(e) => {
                    change(step.id, { notes: e.target.value });
                  }}
                />
              </label>
            )}
            <button
              type="button"
              className="quiet"
              onClick={() => {
                setSteps((old) => old.filter((s) => s.id !== step.id));
              }}
            >
              Remove step
            </button>
          </li>
        ))}
      </ol>
      <div className="actions">
        <button
          type="button"
          className="quiet"
          disabled={busy}
          onClick={() => {
            void readEntry(ctx, entry)
              .then((fresh) => {
                setBase(fresh);
                setSteps(isRun ? stepsOf(fresh.data['steps']) : protocolSteps(fresh));
                setError('');
              })
              .catch((err: unknown) => {
                setError(String(err));
              });
          }}
        >
          Discard step edits and reload
        </button>
        <button
          type="button"
          onClick={() => {
            setSteps((old) => [...old, blankStep()]);
          }}
        >
          Add step
        </button>
        <button
          type="button"
          disabled={busy || steps.some((s) => s.title.trim() === '')}
          onClick={save}
        >
          Save steps
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function RunTools({
  ctx,
  entry,
  entries,
  refresh,
  onOpen,
}: {
  ctx: ModuleContext;
  entry: Entry;
  entries: Entry[];
  refresh: () => void;
  onOpen: (path: string) => void;
}) {
  const [date, setDate] = useState(text(entry.data['start']));
  const [review, setReview] = useState<ScheduleReview | null>(null);
  const [comparison, setComparison] = useState<Entry | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const work = (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    void fn()
      .catch((err: unknown) => {
        setMessage(String(err));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  const previous = text(entry.data['previous']);
  return (
    <>
      <StepEditor key={entry.path} ctx={ctx} entry={entry} refresh={refresh} isRun />
      <section className="workflow-box" aria-label="Repeat and compare">
        <h3>Repeat and compare</h3>
        <div className="actions">
          <button
            disabled={busy}
            onClick={() => {
              work(async () => {
                onOpen(await repeatRun(ctx, entry, false));
              });
            }}
          >
            Repeat all steps
          </button>
          <button
            disabled={busy}
            onClick={() => {
              work(async () => {
                onOpen(await repeatRun(ctx, entry, true));
              });
            }}
          >
            Carry unfinished steps
          </button>
          <button
            disabled={busy || Boolean(entry.data['taskPage'])}
            onClick={() => {
              work(async () => {
                await exportTasks(ctx, entry);
                refresh();
                setMessage(
                  'Checklist added. Edit its tasks in Tasks; run completion is recorded separately here.',
                );
              });
            }}
          >
            Add checklist to experiment
          </button>
        </div>
        {previous && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              work(async () => {
                const path = await ctx.app.resolveLink(
                  previous.replace(/^\[\[|\]\]$/g, ''),
                  entry.path,
                );
                const previousEntry = entries.find((item) => item.path === path);
                if (previousEntry) setComparison(previousEntry);
              });
            }}
          >
            Compare with {label(previous)}
          </button>
        )}
        {comparison && (
          <div className="workflow-review" aria-label="Run comparison">
            <h4>
              {comparison.title} and {entry.title}
            </h4>
            <p>
              Protocol versions: {text(comparison.data['protocolVersion'])} /{' '}
              {text(entry.data['protocolVersion'])}
            </p>
            <table>
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Previous run</th>
                  <th>This run</th>
                </tr>
              </thead>
              <tbody>
                {stepsOf(entry.data['steps']).map((step, index) => {
                  const old =
                    stepsOf(comparison.data['steps']).find(
                      (candidate) => candidate.title === step.title,
                    ) ?? stepsOf(comparison.data['steps'])[index];
                  return (
                    <tr key={step.id}>
                      <td>{step.title}</td>
                      <td>
                        {old
                          ? `${old.done ? 'Done' : 'Not done'}${old.notes ? `: ${old.notes}` : ''}`
                          : 'Not in previous run'}
                      </td>
                      <td>
                        {step.done ? 'Done' : 'Not done'}
                        {step.notes ? `: ${step.notes}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button
              className="quiet"
              onClick={() => {
                setComparison(null);
              }}
            >
              Close comparison
            </button>
          </div>
        )}
      </section>
      <section className="workflow-box" aria-label="Schedule changes">
        <h3>Review a date change</h3>
        <label>
          Proposed start
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setReview(null);
            }}
          />
        </label>
        <button
          disabled={busy || date === text(entry.data['start'])}
          onClick={() => {
            work(async () => {
              setReview(await reviewSchedule(ctx, entry, date, entries));
            });
          }}
        >
          Review affected work
        </button>
        {review && (
          <div className="workflow-review">
            <table>
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Current</th>
                  <th>Proposed</th>
                </tr>
              </thead>
              <tbody>
                {review.dates.map((d, index) => (
                  <tr key={index}>
                    <td>{d.title}</td>
                    <td>{d.before}</td>
                    <td>{d.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul>
              {review.changes.map((change) => (
                <li key={change.entry.path}>{change.description}</li>
              ))}
            </ul>
            <button
              disabled={busy}
              onClick={() => {
                work(async () => {
                  await applySchedule(ctx, review);
                  setReview(null);
                  refresh();
                  setMessage('Reviewed schedule applied.');
                });
              }}
            >
              Apply reviewed changes
            </button>
            <button
              type="button"
              className="quiet"
              onClick={() => {
                setReview(null);
              }}
            >
              Cancel review
            </button>
          </div>
        )}
      </section>
      {message && <p role="status">{message}</p>}
    </>
  );
}

export function ProtocolRunner({ ctx, initial }: { ctx: ModuleContext; initial: string | null }) {
  const { entries, refresh } = useEntries(ctx);
  const [mode, setMode] = useState(initial?.endsWith('.run.yaml') ? 'runs' : 'templates');
  const [focus, setFocus] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [protocol, setProtocol] = useState('');
  const [experiment, setExperiment] = useState('');
  const [name, setName] = useState('');
  const [start, setStart] = useState(today());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const openRun = (path: string) => {
    setFocus(path);
    setMode('runs');
    setCreating(false);
    refresh();
  };
  return (
    <div>
      <div className="workflow-toolbar">
        <button
          aria-pressed={mode === 'templates'}
          onClick={() => {
            setMode('templates');
            setFocus(null);
            setCreating(false);
          }}
        >
          Templates
        </button>
        <button
          aria-pressed={mode === 'runs'}
          onClick={() => {
            setMode('runs');
            setFocus(null);
            setCreating(false);
          }}
        >
          Runs
        </button>
        <button
          onClick={() => {
            setCreating(true);
          }}
        >
          Start protocol run
        </button>
      </div>
      {creating ? (
        <form
          className="workflow-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            void (async () => {
              const selected = entries.find((e) => e.path === protocol);
              if (!selected) throw new Error('Choose a protocol.');
              openRun(
                await createRun(
                  ctx,
                  selected,
                  experiment,
                  name.trim() || `${selected.title} ${start}`,
                  start,
                ),
              );
            })()
              .catch((err: unknown) => {
                setError(String(err));
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          <h2>Start protocol run</h2>
          <label>
            Protocol
            <select
              required
              value={protocol}
              onChange={(e) => {
                setProtocol(e.target.value);
              }}
            >
              <option value="">Choose…</option>
              {entries
                .filter((e) => ['protocol', 'workflowprotocol'].includes(e.type))
                .map((e) => (
                  <option key={e.path} value={e.path}>
                    {e.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Experiment
            <select
              value={experiment}
              onChange={(e) => {
                setExperiment(e.target.value);
              }}
            >
              <option value="">None</option>
              {entries
                .filter((e) => e.type === 'experiment')
                .map((e) => (
                  <option key={e.path} value={e.path}>
                    {e.title}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Run name
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
          </label>
          <label>
            Start date
            <input
              required
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
              }}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="actions">
            <button disabled={busy} type="submit">
              Create run
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <RecordsView
          key={mode + (focus ?? '')}
          ctx={ctx}
          spec={mode === 'runs' ? RUN : TEMPLATE}
          initial={focus}
          detail={(entry, all, reload) =>
            mode === 'runs' ? (
              <RunTools
                key={entry.path}
                ctx={ctx}
                entry={entry}
                entries={all}
                refresh={reload}
                onOpen={openRun}
              />
            ) : (
              <>
                <StepEditor
                  key={entry.path}
                  ctx={ctx}
                  entry={entry}
                  refresh={reload}
                  isRun={false}
                />
                <button
                  onClick={() => {
                    setProtocol(entry.path);
                    setCreating(true);
                  }}
                >
                  Start a run from this protocol
                </button>
              </>
            )
          }
        />
      )}
    </div>
  );
}
