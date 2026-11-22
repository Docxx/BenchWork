import { Check, Circle, CircleDot, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import {
  cleanCopy,
  GROUPS,
  newStep,
  scheduleLine,
  type Collection,
  type LinePlan,
  type LineStep,
} from './lines';
import { StepProgress } from './StepProgress';
import { today, useFly, type FlyStore } from './store';

function StepEditor({
  step,
  steps,
  change,
}: {
  steps: LineStep[];
  step: LineStep;
  change: (s: LineStep) => void;
}) {
  const update = (id: string, patch: Partial<Collection>) => {
    change({
      ...step,
      collections: step.collections.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  };
  return (
    <>
      <div className="fly-fields">
        <label className="fly-field">
          Step name
          <input
            required
            value={step.title}
            onChange={(e) => {
              change({ ...step, title: e.target.value });
            }}
          />
        </label>
        <label className="fly-field">
          Estimated days
          <input
            required
            type="number"
            min="0"
            max="36500"
            value={step.days}
            onChange={(e) => {
              change({ ...step, days: Number(e.target.value) });
            }}
          />
        </label>
      </div>
      {step.collections.map((c) => (
        <fieldset key={c.id} className="fly-line-collection">
          <legend>Collection</legend>
          <div className="fly-fields">
            <label className="fly-field">
              Collect
              <select
                required
                aria-label="Collect"
                value={c.group}
                onChange={(e) => {
                  update(c.id, { group: e.target.value });
                }}
              >
                <option value="">Choose a group</option>
                {GROUPS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <label className="fly-field">
              Number needed
              <input
                type="number"
                min="1"
                required
                value={c.count}
                onChange={(e) => {
                  update(c.id, { count: e.target.value });
                }}
              />
            </label>
            <label className="fly-field">
              Source stock or vial
              <input
                list="fly-line-stocks"
                required
                value={c.source}
                onChange={(e) => {
                  update(c.id, { source: e.target.value });
                }}
              />
            </label>
            <label className="fly-field">
              Why collect these flies?
              <input
                required
                value={c.reason}
                onChange={(e) => {
                  update(c.id, { reason: e.target.value });
                }}
              />
            </label>
            <label className="fly-field">
              Needed for step
              <select
                value={c.neededBy || step.id}
                onChange={(e) => {
                  update(c.id, { neededBy: e.target.value });
                }}
              >
                {steps.map((s, i) => (
                  <option key={s.id} value={s.id}>
                    Step {i + 1} · {s.title || 'Untitled'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={() => {
              change({ ...step, collections: step.collections.filter((item) => item.id !== c.id) });
            }}
          >
            Remove collection
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        onClick={() => {
          change({
            ...step,
            collections: [
              ...step.collections,
              { id: crypto.randomUUID(), group: '', count: '', source: '', reason: '' },
            ],
          });
        }}
      >
        Add collection
      </button>
    </>
  );
}

export function LinesTab({ store }: { store: FlyStore }) {
  const { lines, stocks, loaded } = useFly(store);
  const [selected, select] = useState('');
  const [draft, edit] = useState<LinePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const plan = lines.find((p) => p.path === selected) ?? lines[0];
  const queue = lines
    .filter((p) => !p.template)
    .flatMap((p) => {
      const upcoming = scheduleLine(p).find((item) => !item.step.done);
      return upcoming ? [{ plan: p, ...upcoming }] : [];
    })
    .sort((a, b) => a.start.localeCompare(b.start) || a.plan.name.localeCompare(b.plan.name));
  const next = plan?.steps.findIndex((s) => !s.done) ?? -1;
  async function save(data: LinePlan, path?: string) {
    setBusy(true);
    setError('');
    try {
      select(await store.saveLine(data, path));
      edit(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this line plan. Try again.');
    } finally {
      setBusy(false);
    }
  }
  function reorder(index: number, offset: number) {
    if (!draft) return;
    const steps = [...draft.steps];
    const step = steps[index];
    if (!step) return;
    steps.splice(index, 1);
    steps.splice(index + offset, 0, step);
    edit({ ...draft, steps });
  }
  const [editingPath, setEditingPath] = useState<string>();
  function openEditor(value: LinePlan, path?: string) {
    edit(value);
    setEditingPath(path);
    setError('');
  }
  return (
    <section aria-label="Transgenic lines">
      <h2>Transgenic lines</h2>
      {error && <p role="alert">{error}</p>}
      {draft ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(draft, editingPath);
          }}
        >
          <fieldset disabled={busy} className="fly-line-form">
            <div className="fly-fields">
              <label className="fly-field">
                {draft.template ? 'Template name' : 'Line name'}
                <input
                  required
                  pattern=".*\S.*"
                  value={draft.name}
                  onChange={(e) => {
                    edit({ ...draft, name: e.target.value });
                  }}
                />
              </label>
              <label className="fly-field">
                Planned start
                <input
                  required
                  type="date"
                  value={draft.start}
                  onChange={(e) => {
                    edit({ ...draft, start: e.target.value });
                  }}
                />
              </label>
            </div>
            <datalist id="fly-line-stocks">
              {stocks.map((s) => (
                <option key={s.path} value={s.name} />
              ))}
            </datalist>
            {draft.steps.map((step, i) => (
              <fieldset disabled={step.done} className="fly-editor" key={step.id}>
                <legend>Step {i + 1}</legend>
                <StepEditor
                  steps={draft.steps}
                  step={step}
                  change={(value) => {
                    edit({
                      ...draft,
                      steps: draft.steps.map((s) => (s.id === step.id ? value : s)),
                    });
                  }}
                />
                <div className="fly-line-controls">
                  <button
                    type="button"
                    disabled={i === 0 || draft.steps[i - 1]?.done}
                    onClick={() => {
                      reorder(i, -1);
                    }}
                  >
                    Move earlier
                  </button>
                  <button
                    type="button"
                    disabled={i === draft.steps.length - 1}
                    onClick={() => {
                      reorder(i, 1);
                    }}
                  >
                    Move later
                  </button>
                  <button
                    type="button"
                    disabled={
                      draft.steps.length === 1 ||
                      draft.steps.some(
                        (s) =>
                          s.id !== step.id && s.collections.some((c) => c.neededBy === step.id),
                      )
                    }
                    onClick={() => {
                      edit({ ...draft, steps: draft.steps.filter((s) => s.id !== step.id) });
                    }}
                  >
                    Remove step
                  </button>
                </div>
              </fieldset>
            ))}
            <div className="fly-bar">
              <button
                type="button"
                onClick={() => {
                  edit({ ...draft, steps: [...draft.steps, newStep()] });
                }}
              >
                Add step
              </button>
              <button type="submit">{draft.template ? 'Save template' : 'Save plan'}</button>
              <button
                type="button"
                onClick={() => {
                  edit(null);
                  setError('');
                }}
              >
                Cancel
              </button>
            </div>
          </fieldset>
        </form>
      ) : (
        <>
          <section aria-label="Fly Room work queue" className="fly-editor">
            <h3>Fly Room work queue</h3>
            {queue.length ? (
              <ul>
                {queue.map((item) => (
                  <li key={item.plan.path}>
                    <button
                      disabled={busy}
                      className="fly-name"
                      onClick={() => {
                        select(item.plan.path);
                        setError('');
                      }}
                    >
                      {item.plan.name}
                    </button>{' '}
                    · {item.step.title} · {item.start}
                    {item.end !== item.start && ' · ' + item.end}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No pending line steps.</p>
            )}
          </section>
          <div className="fly-bar">
            {!!lines.length && (
              <select
                aria-label="Line plan"
                value={plan?.path}
                onChange={(e) => {
                  select(e.target.value);
                  setError('');
                }}
                disabled={busy}
              >
                {lines.map((p) => (
                  <option key={p.path} value={p.path}>
                    {p.name}
                    {p.template ? ' (template)' : ''}
                  </option>
                ))}
              </select>
            )}
            <button
              disabled={!loaded || busy}
              onClick={() => {
                openEditor({ name: '', start: today(), steps: [newStep()] });
              }}
            >
              New line plan
            </button>
            {plan && (
              <button
                disabled={busy}
                onClick={() => {
                  openEditor(cleanCopy(plan, today(), !plan.template));
                }}
              >
                {plan.template ? 'Start plan from template' : 'Save as reusable template'}
              </button>
            )}
            {plan && (
              <button
                disabled={busy}
                onClick={() => {
                  openEditor(plan, plan.path);
                }}
              >
                Edit plan
              </button>
            )}
          </div>
          {plan ? (
            <>
              <h3>{plan.name}</h3>
              <p role="status">
                {plan.template
                  ? 'Reusable template'
                  : next < 0
                    ? 'Plan complete'
                    : `Next up · Step ${String(next + 1)} · ${plan.steps[next]?.title ?? ''}`}{' '}
                · {plan.steps.filter((s) => s.done).length} of {plan.steps.length} complete
              </p>
              <nav aria-label="Plan steps" className="fly-step-map">
                {plan.steps.map((step, i) => {
                  const current = !plan.template && i === next;
                  const Icon = step.done ? Check : current ? CircleDot : Circle;
                  return (
                    <div key={step.id}>
                      {i > 0 && <ArrowRight size={16} aria-hidden />}
                      <a href={'#line-step-' + step.id} aria-current={current ? 'step' : undefined}>
                        <Icon size={16} aria-hidden />
                        <span>
                          <small>
                            Step {i + 1}
                            {step.done ? ' · Complete' : current ? ' · Next up' : ''}
                          </small>
                          {step.title}
                        </span>
                      </a>
                    </div>
                  );
                })}
              </nav>
              <ol className="fly-line-timeline" aria-label="Line timetable">
                {scheduleLine(plan).map(({ step, start, end }, i) => (
                  <li
                    id={'line-step-' + step.id}
                    key={step.id}
                    aria-current={!plan.template && next === i ? 'step' : undefined}
                    className="fly-editor"
                  >
                    <strong>
                      {i + 1}. {step.title}
                    </strong>{' '}
                    ·{' '}
                    {plan.template
                      ? 'Template step'
                      : step.done
                        ? 'Complete ' + (step.completedOn || '')
                        : next === i
                          ? 'Next up'
                          : 'Upcoming'}
                    <p>
                      Planned {start}
                      {start !== end && ` – ${end}`} ·{' '}
                      {step.days === 0
                        ? 'Same day'
                        : `${String(step.days)} ${step.days === 1 ? 'day' : 'days'}`}
                    </p>
                    {step.collections.length ? (
                      <ul aria-label="Collections">
                        {step.collections.map((c) => (
                          <li key={c.id}>
                            <strong>
                              {c.count} {c.group.toLowerCase()}
                            </strong>{' '}
                            from {c.source} — {c.reason}. Needed for{' '}
                            <a href={'#line-step-' + (c.neededBy || step.id)}>
                              {plan.steps.find((s) => s.id === (c.neededBy || step.id))?.title ||
                                step.title}
                            </a>
                            .
                            {c.actual && (
                              <>
                                {' '}
                                Collected {c.actual} of {c.count}.
                              </>
                            )}
                            {step.done &&
                              Number(c.actual) < Number(c.count) &&
                              (c.resolution === 'carry'
                                ? ' Remainder carried forward.'
                                : ' ' + (c.note || ''))}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No collection planned.</p>
                    )}
                    {!plan.template && i === next && (
                      <StepProgress
                        key={JSON.stringify([plan.path, step])}
                        plan={plan}
                        step={step}
                        busy={busy}
                        save={(p) => save(p, plan.path)}
                      />
                    )}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p>
              {loaded
                ? 'Create a line plan to schedule steps and record what to collect.'
                : 'Loading line plans…'}
            </p>
          )}
        </>
      )}
    </section>
  );
}
