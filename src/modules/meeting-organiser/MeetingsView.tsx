import { useState } from 'react';
import type { ModuleContext } from '@core/api';
import { RecordsView, today, type Entry, type RecordSpec } from '../research/api';
import { exportActions, prepareAgenda } from './meetings';
export const MEETING: RecordSpec = {
  kind: 'meeting',
  title: 'Meetings',
  singular: 'meeting',
  folder: 'Research/Meetings',
  defaults: () => ({ date: today(), status: 'planned' }),
  fields: [
    { key: 'date', label: 'Date', kind: 'date' },
    { key: 'participants', label: 'Participants' },
    {
      key: 'status',
      label: 'Status',
      kind: 'choice',
      options: ['planned', 'held', 'follow-up complete'],
    },
    { key: 'experiments', label: 'Experiments', kind: 'links', types: ['experiment'] },
    { key: 'questions', label: 'Questions', kind: 'links', types: ['question'] },
    { key: 'agenda', label: 'Agenda', kind: 'long' },
    { key: 'notes', label: 'Meeting notes', kind: 'long' },
    { key: 'decisions', label: 'Decisions', kind: 'long' },
    { key: 'actions', label: 'Follow-ups (one per line)', kind: 'long' },
    {
      key: 'taskTarget',
      label: 'Send follow-ups to',
      kind: 'link',
      types: ['experiment', 'page', 'note', 'daily'],
    },
    { key: 'due', label: 'Follow-up due date', kind: 'date' },
  ],
};
function MeetingActions({
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
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const work = (action: () => Promise<string>) => {
    setBusy(true);
    void action()
      .then((result) => {
        setMessage(result);
        refresh();
      })
      .catch((err: unknown) => {
        setMessage(String(err));
      })
      .finally(() => {
        setBusy(false);
      });
  };
  return (
    <section className="workflow-box">
      <h3>Prepare and follow through</h3>
      <div className="actions">
        <button
          disabled={busy}
          onClick={() => {
            work(async () => {
              await prepareAgenda(ctx, entry, entries);
              return 'Linked research added to the agenda.';
            });
          }}
        >
          Prepare agenda from linked research
        </button>
        <button
          disabled={busy}
          onClick={() => {
            work(
              async () =>
                `Added ${String(await exportActions(ctx, entry))} follow-ups. Existing tasks were kept.`,
            );
          }}
        >
          Create follow-up tasks
        </button>
      </div>
      <p className="hint">
        Follow-ups go to the chosen page, or today’s daily page if none is chosen. They appear in
        Tasks when it is enabled.
      </p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
export function MeetingsView({ ctx, initial }: { ctx: ModuleContext; initial: string | null }) {
  return (
    <RecordsView
      ctx={ctx}
      spec={MEETING}
      initial={initial}
      detail={(entry, entries, refresh) => (
        <MeetingActions
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
