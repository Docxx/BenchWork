import { useState } from 'react';
import { completeStep, type LinePlan, type LineStep } from './lines';
import { today } from './store';

export function StepProgress({
  plan,
  step,
  busy,
  save,
}: {
  plan: LinePlan;
  step: LineStep;
  busy: boolean;
  save: (p: LinePlan) => Promise<void>;
}) {
  const [collections, set] = useState(step.collections);
  const [error, setError] = useState('');
  const patch = (index: number, fields: Partial<(typeof collections)[number]>) => {
    set((items) => items.map((c, i) => (i === index ? { ...c, ...fields } : c)));
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError('');
        try {
          void save(completeStep(plan, { ...step, collections }, today()));
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Check collection details.');
        }
      }}
    >
      <fieldset disabled={busy} className="fly-line-form">
        {collections.map((c, i) => (
          <fieldset className="fly-line-collection" key={c.id}>
            <legend>
              {c.group} · {c.source}
            </legend>
            <div className="fly-fields">
              <label className="fly-field">
                Actual collected (target {c.count})
                <input
                  type="number"
                  min="0"
                  value={c.actual ?? ''}
                  onChange={(e) => {
                    patch(i, { actual: e.target.value });
                  }}
                />
              </label>
              {c.actual && Number(c.actual) < Number(c.count) && (
                <>
                  <label className="fly-field">
                    Shortfall of {Number(c.count) - Number(c.actual)}
                    <select
                      value={c.resolution ?? ''}
                      onChange={(e) => {
                        patch(i, { resolution: e.target.value });
                      }}
                    >
                      <option value="">Choose an action</option>
                      <option value="carry">Carry remainder to next step</option>
                      <option value="note">Proceed with a note</option>
                    </select>
                  </label>
                  {c.resolution === 'note' && (
                    <label className="fly-field">
                      Shortfall note
                      <input
                        value={c.note ?? ''}
                        onChange={(e) => {
                          patch(i, { note: e.target.value });
                        }}
                      />
                    </label>
                  )}
                </>
              )}
            </div>
          </fieldset>
        ))}
        {error && <p role="alert">{error}</p>}
        <div className="fly-bar">
          {collections.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                if (e.currentTarget.form?.reportValidity())
                  void save({
                    ...plan,
                    steps: plan.steps.map((s) => (s.id === step.id ? { ...step, collections } : s)),
                  });
              }}
            >
              Save counts
            </button>
          )}
          <button type="submit">Mark step complete</button>
        </div>
      </fieldset>
    </form>
  );
}
