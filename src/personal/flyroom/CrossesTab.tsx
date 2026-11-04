import { useState } from 'react';
import type { ModuleContext } from '@core/api';
import { GenotypeView } from './GenotypeView';
import { emptyPlan, type Plan } from './PlannerTab';
import { CROSS_STATUSES, linkName, type Cross } from './records';
import { dueSteps, nearestTemperature, steps, TEMPERATURES } from './schedule';
import { dayLabel, nextFlip } from './StocksTab';
import { today, useFly, type FlyStore } from './store';

const ACTIVE = new Set(['Planned', 'Set up', 'Collecting']);

/** The next step not yet ticked off, or null when all are done. */
function nextStep(c: Cross, timings: Parameters<typeof steps>[2]) {
  return steps(c.setUp, c.temperature, timings).find((s) => !c.done.includes(s.id)) ?? null;
}

function CrossEditor({
  ctx,
  store,
  cross,
  onOpen,
  onCrossOn,
}: {
  ctx: ModuleContext;
  store: FlyStore;
  cross: Cross;
  onOpen: (path: string) => void;
  onCrossOn: (plan: Plan) => void;
}) {
  const { crosses, settings } = useFly(store);
  const day = today();
  const timetable = steps(cross.setUp, cross.temperature, settings.timings);
  const save = (changes: Record<string, unknown>) => void store.update(cross.path, changes);
  const children = crosses.filter((c) => linkName(c.parent) === cross.name);
  const parent = crosses.find((c) => c.name === linkName(cross.parent));

  const tick = (id: string, on: boolean) => {
    const done = on ? [...new Set([...cross.done, id])] : cross.done.filter((d) => d !== id);
    const changes: Record<string, unknown> = { done };
    if (on && (id === 'hatch' || id === 'collect') && cross.status === 'Set up') {
      changes['status'] = 'Collecting';
    }
    if (on && id === 'last' && ACTIVE.has(cross.status)) changes['status'] = 'Done';
    save(changes);
  };

  return (
    <section className="fly-editor" aria-label={`Cross ${cross.name}`}>
      <div className="fly-editor-head">
        <h3>{cross.name}</h3>
        <span className="fly-spacer" />
        <button
          type="button"
          className="quiet"
          onClick={() => {
            onCrossOn({
              mother: { stock: linkName(cross.mother) || null, genotype: cross.motherGenotype },
              father: { stock: linkName(cross.father) || null, genotype: cross.fatherGenotype },
              parent: cross.name,
            });
          }}
        >
          Show progeny
        </button>
        {cross.wanted !== '' && (
          <button
            type="button"
            className="quiet"
            onClick={() => {
              onCrossOn({
                ...emptyPlan(),
                mother: { stock: null, genotype: cross.wanted },
                parent: cross.name,
              });
            }}
          >
            Cross on from the progeny wanted
          </button>
        )}
        <button type="button" className="quiet" onClick={() => void ctx.app.open(cross.path)}>
          Open file
        </button>
      </div>
      <div className="fly-cross-parents">
        <div>
          <span className="label">♀ {linkName(cross.mother) || 'Virgins'}</span>
          <GenotypeView genotype={cross.motherGenotype} />
        </div>
        <span className="fly-times" aria-hidden="true">
          ×
        </span>
        <div>
          <span className="label">♂ {linkName(cross.father) || 'Males'}</span>
          <GenotypeView genotype={cross.fatherGenotype} />
        </div>
      </div>
      {cross.wanted !== '' && (
        <p>
          <span className="label">Progeny wanted </span>
          <GenotypeView genotype={cross.wanted} />
        </p>
      )}
      <div className="fly-fields">
        <label className="fly-field">
          <span className="label">Set up</span>
          <input
            type="date"
            aria-label="Set up"
            value={cross.setUp}
            onChange={(e) => {
              save({ setUp: e.target.value === '' ? null : e.target.value });
            }}
          />
        </label>
        <label className="fly-field">
          <span className="label">Temperature</span>
          <select
            aria-label="Temperature"
            value={String(nearestTemperature(cross.temperature))}
            onChange={(e) => {
              save({ temperature: Number(e.target.value) });
            }}
          >
            {TEMPERATURES.map((t) => (
              <option key={t} value={t}>
                {t} °C
              </option>
            ))}
          </select>
        </label>
        <label className="fly-field">
          <span className="label">Status</span>
          <select
            aria-label="Status"
            value={cross.status}
            onChange={(e) => {
              save({ status: e.target.value });
            }}
          >
            {CROSS_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="fly-field">
          <span className="label">For</span>
          <input
            aria-label="For"
            defaultValue={cross.purpose}
            placeholder="Climbing assay"
            onBlur={(e) => {
              if (e.target.value.trim() !== cross.purpose)
                save({ purpose: e.target.value.trim() || null });
            }}
          />
        </label>
      </div>
      {timetable.length === 0 ? (
        <p className="hint">Add the set-up date to see the timetable.</p>
      ) : (
        <ol className="fly-timeline" aria-label="Timetable">
          {timetable.map((s) => {
            const done = cross.done.includes(s.id);
            const late = !done && s.date <= day;
            return (
              <li key={s.id} className={done ? 'done' : late ? 'due' : ''}>
                <label>
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={(e) => {
                      tick(s.id, e.target.checked);
                    }}
                  />
                  <span className="fly-step-date">
                    {dayLabel(s.date)}
                    {s.until !== undefined && ` to ${dayLabel(s.until)}`}
                  </span>
                  <span>{s.title}</span>
                </label>
                {s.hint !== undefined && <span className="hint">{s.hint}</span>}
              </li>
            );
          })}
        </ol>
      )}
      {(parent !== undefined || children.length > 0) && (
        <p className="fly-family">
          {parent !== undefined && (
            <>
              From{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  onOpen(parent.path);
                }}
              >
                {parent.name}
              </button>
              {children.length > 0 && '. '}
            </>
          )}
          {children.length > 0 && (
            <>
              Crossed on in{' '}
              {children.map((c, i) => (
                <span key={c.path}>
                  {i > 0 && ', '}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      onOpen(c.path);
                    }}
                  >
                    {c.name}
                  </button>
                </span>
              ))}
            </>
          )}
        </p>
      )}
      <label className="fly-field">
        <span className="label">Notes</span>
        <textarea
          aria-label="Notes"
          rows={3}
          defaultValue={cross.notes}
          onBlur={(e) => {
            if (e.target.value.trim() !== cross.notes)
              save({ notes: e.target.value.trim() || null });
          }}
        />
      </label>
    </section>
  );
}

/** Crosses being tracked: what is next for each, and one open in full. */
export function CrossesTab({
  ctx,
  store,
  open,
  onOpen,
  onCrossOn,
}: {
  ctx: ModuleContext;
  store: FlyStore;
  open: string | null;
  onOpen: (path: string | null) => void;
  onCrossOn: (plan: Plan) => void;
}) {
  const { crosses, settings, loaded } = useFly(store);
  const [all, setAll] = useState(false);
  const day = today();
  const shown = crosses.filter((c) => all || ACTIVE.has(c.status) || c.path === open);
  const current = crosses.find((c) => c.path === open);

  if (!loaded) return <p className="hint">Reading…</p>;
  return (
    <section aria-label="Crosses">
      <div className="fly-bar">
        <label className="choice">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => {
              setAll(e.target.checked);
            }}
          />
          Show finished crosses too
        </label>
        <span className="fly-spacer" />
        <button
          type="button"
          onClick={() => {
            onCrossOn(emptyPlan());
          }}
        >
          New cross
        </button>
      </div>
      {current && (
        <CrossEditor
          key={current.path}
          ctx={ctx}
          store={store}
          cross={current}
          onOpen={onOpen}
          onCrossOn={onCrossOn}
        />
      )}
      {shown.length === 0 ? (
        <p className="hint">
          {crosses.length === 0
            ? 'No crosses yet. Plan one in the cross planner, then set it up.'
            : 'No crosses on the go.'}
        </p>
      ) : (
        <div className="fly-scroll">
          <table className="fly-table">
            <thead>
              <tr>
                <th>Cross</th>
                <th>Set up</th>
                <th>Status</th>
                <th>Next</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const next = ACTIVE.has(c.status) ? nextStep(c, settings.timings) : null;
                return (
                  <tr key={c.path} aria-selected={c.path === open}>
                    <td>
                      <button
                        type="button"
                        className="fly-name"
                        aria-expanded={c.path === open}
                        onClick={() => {
                          onOpen(c.path === open ? null : c.path);
                        }}
                      >
                        {c.name}
                      </button>
                    </td>
                    <td>
                      {dayLabel(c.setUp)}{' '}
                      <span className="hint">{nearestTemperature(c.temperature)} °C</span>
                    </td>
                    <td>
                      <span
                        className={`fly-status cross-${c.status.toLowerCase().replace(' ', '-')}`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td>
                      {next !== null && (
                        <span className={next.date <= day ? 'flip-due late' : 'flip-due'}>
                          {next.title}, {dayLabel(next.date)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** For Home: cross steps due today or overdue, and stocks due a flip. */
export function FlyToday({ store, onOpen }: { store: FlyStore; onOpen: () => void }) {
  const { crosses, stocks, settings, loaded } = useFly(store);
  const day = today();
  if (!loaded) return <p className="hint">Reading…</p>;
  const due = crosses
    .filter((c) => ACTIVE.has(c.status))
    .flatMap((c) =>
      dueSteps(steps(c.setUp, c.temperature, settings.timings), c.done, day).map((s) => ({ c, s })),
    );
  const flips = stocks
    .map((s) => ({ s, next: nextFlip(s) }))
    .filter(
      (x): x is { s: (typeof stocks)[number]; next: string } => x.next !== null && x.next <= day,
    );
  if (due.length === 0 && flips.length === 0) {
    return <p className="hint">Nothing to do in the fly room today.</p>;
  }
  return (
    <ul className="fly-today">
      {due.map(({ c, s }) => (
        <li key={`${c.path} ${s.id}`}>
          <button type="button" className="link-button" onClick={onOpen}>
            {c.name}
          </button>
          <span>{s.title}</span>
          <button
            type="button"
            className="quiet"
            onClick={() => void store.update(c.path, { done: [...new Set([...c.done, s.id])] })}
          >
            Done
          </button>
        </li>
      ))}
      {flips.map(({ s }) => (
        <li key={s.path}>
          <span className="fly-today-name">{s.name}</span>
          <span>Flip</span>
          <button
            type="button"
            className="quiet"
            onClick={() => void store.update(s.path, { lastFlipped: day })}
          >
            Flipped
          </button>
        </li>
      ))}
    </ul>
  );
}
