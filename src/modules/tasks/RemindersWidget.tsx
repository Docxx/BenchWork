import { useState } from 'react';
import type { ModuleContext } from '@core/api';
import { useTasks, type TaskStore } from './store';
import { dayOf } from './tasks';

/** The time now plus an hour, rounded to the quarter, as `HH:MM`, for the form. */
function nextHour(now = new Date()): string {
  const d = new Date(now.getTime() + 60 * 60_000);
  d.setMinutes(Math.round(d.getMinutes() / 15) * 15, 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Today's reminders, from every page, and a quick way to add one: it goes
 * on today's page as a task with ⏰, so it syncs and shows like any task.
 */
export function RemindersWidget({ ctx, store }: { ctx: ModuleContext; store: TaskStore }) {
  const tasks = useTasks(store);
  const [text, setText] = useState('');
  const [time, setTime] = useState(nextHour);
  const [busy, setBusy] = useState(false);
  const today = dayOf(new Date());
  const now = new Date();
  const todays = tasks
    .filter((t) => t.remind?.startsWith(today) === true)
    .sort((a, b) => (a.remind ?? '').localeCompare(b.remind ?? ''));

  const add = async () => {
    if (text.trim() === '' || !/^\d{1,2}:\d{2}$/.test(time)) return;
    setBusy(true);
    try {
      const page = await ctx.app.todayPage();
      if (page === null) return;
      await ctx.app.appendToPage(page, `- [ ] ${text.trim()} ⏰ ${today} ${time}`);
      await store.refresh([page]);
      setText('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="reminders">
      {!store.loaded ? (
        <p className="hint">Gathering reminders…</p>
      ) : todays.length === 0 ? (
        <p className="hint">No reminders today.</p>
      ) : (
        <ul className="reminder-list">
          {todays.map((t) => {
            const at = t.remind?.slice(11) ?? '';
            const past = (t.remind ?? '') <= `${today}T${now.toTimeString().slice(0, 5)}`;
            return (
              <li
                key={`${t.path}:${String(t.line)}`}
                className={[t.state === 'done' ? 'done' : '', past ? 'past' : ''].join(' ').trim()}
              >
                <span className="reminder-time">{at}</span>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => void ctx.app.open(t.path)}
                >
                  {t.text}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="reminder-form"
        aria-label="New reminder"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input
          aria-label="Remind me to"
          placeholder="Remind me to…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
        />
        <input
          type="time"
          aria-label="At"
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
          }}
        />
        <button type="submit" className="quiet" disabled={busy || text.trim() === ''}>
          Add
        </button>
      </form>
    </div>
  );
}
