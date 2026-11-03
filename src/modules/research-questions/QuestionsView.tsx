import { useState } from 'react';
import type { ModuleContext } from '@core/api';
import {
  link,
  RecordsView,
  text,
  today,
  useEntries,
  type Entry,
  type RecordSpec,
} from '../research/api';
export const QUESTION_STATUSES = [
  'open',
  'testing',
  'supported',
  'not supported',
  'uncertain',
  'closed',
];
export const QUESTION: RecordSpec = {
  kind: 'question',
  title: 'Research questions',
  singular: 'question',
  folder: 'Research/Questions',
  defaults: { status: 'open' },
  fields: [
    { key: 'question', label: 'Question', kind: 'long' },
    { key: 'hypothesis', label: 'Hypothesis', kind: 'long' },
    { key: 'status', label: 'Status', kind: 'choice', options: QUESTION_STATUSES },
    { key: 'experiments', label: 'Experiments', kind: 'links', types: ['experiment'] },
    { key: 'evidence', label: 'Evidence and papers', kind: 'links' },
    { key: 'conclusion', label: 'Conclusion', kind: 'long' },
    { key: 'nextTest', label: 'Next test', kind: 'long' },
    { key: 'notes', label: 'Notes', kind: 'long' },
  ],
};

export async function planTest(
  ctx: ModuleContext,
  entry: Entry,
  name: string,
): Promise<string | null> {
  await ctx.vault.ensureDir('Research/Experiments');
  return ctx.app.createPage('Research/Experiments', name, 'experiment', {
    properties: {
      aim: text(entry.data['nextTest']) || text(entry.data['question']) || entry.title,
      date: today(),
      status: 'planned',
      question: [link(entry.path)],
    },
    body: '## Aim\n\n## Method\n\n## Results\n\n## Notes\n\n',
  });
}
function QuestionActions({ ctx, entry }: { ctx: ModuleContext; entry: Entry }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <section className="workflow-box">
      <h3>Next experiment</h3>
      <p>
        {text(entry.data['nextTest']) ||
          'Describe the next test in Edit details, then create a linked experiment.'}
      </p>
      <button
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void (async () => {
            const name = await ctx.app.askText({
              title: 'Plan next experiment',
              label: 'Experiment name',
              initial: `${entry.title} test`,
            });
            if (name?.trim()) {
              const path = await planTest(ctx, entry, name);
              if (path) await ctx.app.openView('research.experiments', path);
            }
          })()
            .catch((err: unknown) => {
              setError(String(err));
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      >
        Plan next experiment
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function QuestionsView({ ctx, initial }: { ctx: ModuleContext; initial: string | null }) {
  const { entries } = useEntries(ctx);
  const [focus, setFocus] = useState(initial);
  return (
    <>
      <section className="workflow-question-board" aria-label="Questions board">
        {QUESTION_STATUSES.map((status) => (
          <div className="workflow-box" key={status}>
            <h3>{status}</h3>
            {entries
              .filter((e) => e.type === 'question' && (e.data['status'] || 'open') === status)
              .map((entry) => (
                <button
                  className="workflow-list-item"
                  key={entry.path}
                  onClick={() => {
                    setFocus(entry.path);
                  }}
                >
                  {entry.title}
                </button>
              ))}
          </div>
        ))}
      </section>
      <RecordsView
        key={focus ?? 'questions'}
        ctx={ctx}
        spec={QUESTION}
        initial={focus}
        detail={(entry) => <QuestionActions key={entry.path} ctx={ctx} entry={entry} />}
      />
    </>
  );
}
