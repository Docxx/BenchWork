import { useEffect, useState } from 'react';
import type { ModuleContext } from '@core/api';
import { RecordsView, type Entry, type RecordSpec } from '../research/api';
import { aliquots, ancestry, validateParents } from './samples';

export const SAMPLE: RecordSpec = {
  kind: 'sample',
  title: 'Samples',
  singular: 'sample',
  folder: 'Research/Samples',
  defaults: { status: 'planned' },
  fields: [
    { key: 'experiment', label: 'Experiment', kind: 'link', types: ['experiment'] },
    { key: 'parents', label: 'Parent samples', kind: 'links', types: ['sample'] },
    {
      key: 'source',
      label: 'Source stock, cross or material',
      kind: 'link',
      types: ['flystock', 'cross', 'reagent', 'antibody'],
    },
    { key: 'collected', label: 'Collected', kind: 'datetime-local' },
    { key: 'treatment', label: 'Treatment' },
    { key: 'condition', label: 'Condition or genotype' },
    { key: 'location', label: 'Storage location' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'unit', label: 'Unit' },
    {
      key: 'status',
      label: 'Status',
      kind: 'choice',
      options: ['planned', 'collected', 'stored', 'used', 'archived'],
    },
    { key: 'datasets', label: 'Measurements and data', kind: 'links' },
    { key: 'notes', label: 'Notes', kind: 'long' },
  ],
};
function SampleDetail({
  ctx,
  entry,
  entries,
  refresh,
}: {
  ctx: ModuleContext;
  entry: Entry;
  entries: Entry[];
  refresh: () => void;
}) {
  const [parents, setParents] = useState<Entry[]>([]);
  const [count, setCount] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void ancestry(ctx, entry, entries)
      .then((found) => {
        if (active) setParents(found);
      })
      .catch((err: unknown) => {
        if (active) setError(String(err));
      });
    return () => {
      active = false;
    };
  }, [ctx, entry, entries]);
  return (
    <section className="workflow-box">
      <h3>Lineage</h3>
      {parents.length ? (
        <ol>
          {parents.map((parent) => (
            <li key={parent.path}>
              <button className="link-button" onClick={() => void ctx.app.open(parent.path)}>
                {parent.title}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="hint">Link parents or source material to trace this sample.</p>
      )}
      <label>
        Number of aliquots
        <input
          type="number"
          min="1"
          max="96"
          value={count}
          onChange={(e) => {
            setCount(Number(e.target.value));
          }}
        />
      </label>
      <button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void aliquots(ctx, entry, count)
            .then(() => {
              refresh();
              setError('');
            })
            .catch((err: unknown) => {
              setError(String(err));
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      >
        Create aliquots
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function SamplesView({ ctx, initial }: { ctx: ModuleContext; initial: string | null }) {
  return (
    <RecordsView
      ctx={ctx}
      spec={{
        ...SAMPLE,
        validate: (data, entries, current) => validateParents(ctx, data, entries, current),
      }}
      initial={initial}
      detail={(entry, entries, refresh) => (
        <SampleDetail
          key={entry.path}
          ctx={ctx}
          entry={entry}
          entries={entries}
          refresh={refresh}
        />
      )}
    />
  );
}
