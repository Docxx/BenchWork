import { useEffect, useState } from 'react';
import type { ModuleContext } from '@core/api';
import { RecordsView, relatedEntries, link, text, today, type Entry, type RecordSpec } from './api';

export const EXPERIMENT_SPEC: RecordSpec = {
  kind: 'experiment',
  title: 'Experiments',
  singular: 'experiment',
  folder: 'Research/Experiments',
  page: true,
  viewId: 'research.experiments',
  defaults: () => ({ status: 'planned', date: today() }),
  fields: [
    { key: 'aim', label: 'Aim', kind: 'long' },
    { key: 'date', label: 'Start date', kind: 'date' },
    {
      key: 'status',
      label: 'Status',
      kind: 'choice',
      options: ['planned', 'running', 'done', 'stopped'],
    },
    { key: 'project', label: 'Project', kind: 'link', types: ['project'] },
    { key: 'protocol', label: 'Protocol', kind: 'link', types: ['protocol', 'workflowprotocol'] },
    { key: 'conditions', label: 'Conditions', kind: 'list' },
    { key: 'genotypes', label: 'Genotypes', kind: 'list' },
    {
      key: 'materials',
      label: 'Stocks, crosses and materials',
      kind: 'links',
      types: ['flystock', 'cross', 'reagent', 'antibody', 'sample'],
    },
    { key: 'datasets', label: 'Datasets and analysis', kind: 'links' },
    { key: 'question', label: 'Research questions', kind: 'links', types: ['question'] },
    { key: 'conclusion', label: 'Conclusion', kind: 'long' },
    { key: 'next', label: 'Next steps', kind: 'long' },
  ],
};

function ExperimentConnections({
  ctx,
  entry,
  entries,
}: {
  ctx: ModuleContext;
  entry: Entry;
  entries: Entry[];
}) {
  const [tab, setTab] = useState('Plan');
  const [related, setRelated] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void relatedEntries(ctx, entry, entries)
      .then(async (items) => {
        const found = new Map(items.map((item) => [item.path, item]));
        for (const child of items.filter((item) => ['run', 'sample'].includes(item.type))) {
          for (const connected of await relatedEntries(ctx, child, entries)) {
            if (
              connected.path !== entry.path &&
              !['experiment', 'project'].includes(connected.type)
            )
              found.set(connected.path, connected);
          }
        }
        return [...found.values()];
      })
      .then((items) => {
        if (active) setRelated(items);
      })
      .catch((err: unknown) => {
        if (active) setError(String(err));
      });
    return () => {
      active = false;
    };
  }, [ctx, entry, entries]);
  const groups: Record<string, string[]> = {
    Plan: [
      'protocol',
      'workflowprotocol',
      'equipment',
      'booking',
      'project',
      'flystock',
      'cross',
      'reagent',
      'antibody',
    ],
    Run: ['run', 'sample', 'page', 'note', 'daily'],
    Results: ['dataset', 'analysis', 'sample'],
    Review: ['question', 'meeting', 'experiment'],
  };
  const shown = related.filter((item) => groups[tab]?.includes(item.type));
  const repeat = async () => {
    const name = await ctx.app.askText({
      title: 'Repeat experiment',
      label: 'Name',
      initial: `${entry.title} repeat`,
    });
    if (!name?.trim()) return;
    const properties = Object.fromEntries(
      Object.entries(entry.data).filter(
        ([key]) => !['id', 'created', 'modified', 'conclusion', 'next', 'datasets'].includes(key),
      ),
    );
    const path = await ctx.app.createPage(
      entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '',
      name,
      'experiment',
      {
        properties: { ...properties, status: 'planned', date: today(), previous: link(entry.path) },
        body: '## Aim\n\n## Method\n\n## Results\n\n## Notes\n\n',
      },
    );
    if (path) await ctx.app.openView('research.experiments', path);
  };
  return (
    <section className="workflow-box" aria-label="Experiment workspace">
      <div role="tablist" aria-label="Experiment stages">
        {Object.keys(groups).map((name) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === name}
            key={name}
            onClick={() => {
              setTab(name);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tab}>
        <h3>{tab}</h3>
        {shown.length === 0 ? (
          <p className="hint">Linked {tab.toLowerCase()} records appear here as you add them.</p>
        ) : (
          <ul>
            {shown.map((item) => (
              <li key={item.path}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => void ctx.app.open(item.path)}
                >
                  {item.title}
                </button>{' '}
                <span className="hint">{item.type}</span>
              </li>
            ))}
          </ul>
        )}
        {tab === 'Review' && (
          <p>
            {text(entry.data['conclusion']) ||
              'Record conclusions and follow-up work in Edit details.'}
          </p>
        )}
      </div>
      <div className="actions">
        <button type="button" onClick={() => void ctx.app.open(entry.path)}>
          Write experiment notes
        </button>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            void repeat().catch((err: unknown) => {
              setError(String(err));
            });
          }}
        >
          Repeat experiment
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export function ExperimentHub({ ctx, initial }: { ctx: ModuleContext; initial: string | null }) {
  return (
    <RecordsView
      ctx={ctx}
      spec={EXPERIMENT_SPEC}
      initial={initial}
      detail={(entry, entries) => (
        <ExperimentConnections key={entry.path} ctx={ctx} entry={entry} entries={entries} />
      )}
    />
  );
}
