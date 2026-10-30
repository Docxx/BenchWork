import { useMemo, useState, type DragEvent } from 'react';
import type { ModuleContext } from '@core/api';
import { useTasks, type TaskStore } from './store';
import { dayOf, dueFits, sortTasks, type DueFilter, type Task, type TaskState } from './tasks';

const DUE_FILTERS: { value: DueFilter; label: string }[] = [
  { value: 'all', label: 'Any time' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due by today' },
  { value: 'week', label: 'Due this week' },
  { value: 'none', label: 'No date' },
];

const COLUMNS: { state: TaskState; title: string }[] = [
  { state: 'todo', title: 'To do' },
  { state: 'doing', title: 'Doing' },
  { state: 'done', title: 'Done' },
];

const keyOf = (t: Task) => `${t.path}#${String(t.line)}`;

/** A page's name, from its path. */
function pageName(path: string): string {
  return (path.split('/').at(-1) ?? path).replace(/\.md$/i, '');
}

/** A due date as people read it, and whether it has passed. */
function dueLabel(due: string, today: string): { text: string; late: boolean } {
  if (due === today) return { text: 'Today', late: false };
  const date = new Date(`${due}T12:00:00`);
  return {
    text: date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
    late: due < today,
  };
}

function TaskWhere({ ctx, task }: { ctx: ModuleContext; task: Task }) {
  return (
    <button type="button" className="task-page" onClick={() => void ctx.app.open(task.path)}>
      {pageName(task.path)}
    </button>
  );
}

function Due({ task, today }: { task: Task; today: string }) {
  if (task.due === null) return null;
  const { text, late } = dueLabel(task.due, today);
  return (
    <span className={late && task.state !== 'done' ? 'task-due late' : 'task-due'}>{text}</span>
  );
}

/** Checklist items from every page: filtered, ticked off, and dated here. */
function TaskList({
  ctx,
  store,
  tasks,
  today,
}: {
  ctx: ModuleContext;
  store: TaskStore;
  tasks: Task[];
  today: string;
}) {
  if (tasks.length === 0) return <p className="hint">No tasks here.</p>;
  return (
    <ul className="task-list" aria-label="Tasks">
      {tasks.map((t) => (
        <li key={keyOf(t)} className={`task ${t.state}`}>
          <input
            type="checkbox"
            aria-label={t.text}
            checked={t.state === 'done'}
            onChange={(e) => void store.set(t, e.target.checked ? 'done' : 'todo')}
          />
          <span className="task-text">{t.text}</span>
          {t.state === 'doing' && <span className="task-doing">Doing</span>}
          <Due task={t} today={today} />
          <input
            type="date"
            className="task-date"
            aria-label={`Due date for ${t.text}`}
            value={t.due ?? ''}
            onChange={(e) =>
              void store.set(t, t.state, e.target.value === '' ? null : e.target.value)
            }
          />
          <TaskWhere ctx={ctx} task={t} />
        </li>
      ))}
    </ul>
  );
}

/** To do, Doing and Done, as columns: drag a card, or use its arrows. */
function TaskBoard({
  ctx,
  store,
  tasks,
  today,
}: {
  ctx: ModuleContext;
  store: TaskStore;
  tasks: Task[];
  today: string;
}) {
  const [over, setOver] = useState<TaskState | null>(null);
  const byKey = new Map(tasks.map((t) => [keyOf(t), t]));
  const move = (task: Task, by: number) => {
    const i = COLUMNS.findIndex((c) => c.state === task.state);
    const next = COLUMNS[i + by];
    if (next) void store.set(task, next.state);
  };
  const drop = (state: TaskState) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const task = byKey.get(e.dataTransfer.getData('text/x-benchwork-task'));
    if (task && task.state !== state) void store.set(task, state);
  };

  return (
    <div className="task-board">
      {COLUMNS.map((col, ci) => {
        const cards = tasks.filter((t) => t.state === col.state);
        return (
          <section
            key={col.state}
            className={over === col.state ? 'task-column over' : 'task-column'}
            aria-label={col.title}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(col.state);
            }}
            onDragLeave={() => {
              setOver(null);
            }}
            onDrop={drop(col.state)}
          >
            <h2>
              {col.title} <span className="hint">{cards.length}</span>
            </h2>
            {cards.map((t) => (
              <article
                key={keyOf(t)}
                className="task-card"
                draggable
                aria-label={t.text}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/x-benchwork-task', keyOf(t));
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <p>{t.text}</p>
                <div className="task-card-foot">
                  <Due task={t} today={today} />
                  <TaskWhere ctx={ctx} task={t} />
                  <span className="task-moves">
                    {ci > 0 && (
                      <button
                        type="button"
                        aria-label={`Move to ${COLUMNS[ci - 1]?.title ?? ''}`}
                        onClick={() => {
                          move(t, -1);
                        }}
                      >
                        ←
                      </button>
                    )}
                    {ci < COLUMNS.length - 1 && (
                      <button
                        type="button"
                        aria-label={`Move to ${COLUMNS[ci + 1]?.title ?? ''}`}
                        onClick={() => {
                          move(t, 1);
                        }}
                      >
                        →
                      </button>
                    )}
                  </span>
                </div>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}

/** The Tasks view: every checklist item in the vault, as a list or a board. */
export function TasksView({ ctx, store }: { ctx: ModuleContext; store: TaskStore }) {
  const all = useTasks(store);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [notebook, setNotebook] = useState('');
  const [due, setDue] = useState<DueFilter>('all');
  const [showDone, setShowDone] = useState(false);
  const [query, setQuery] = useState('');
  const today = dayOf(new Date());

  const notebooks = useMemo(
    () =>
      [...new Set(all.map((t) => (t.path.includes('/') ? (t.path.split('/')[0] ?? '') : '')))]
        .filter(Boolean)
        .sort(),
    [all],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortTasks(
      all.filter(
        (t) =>
          (notebook === '' || t.path.startsWith(`${notebook}/`)) &&
          dueFits(t, due, today) &&
          (showDone || view === 'board' || t.state !== 'done') &&
          (q === '' ||
            t.text.toLowerCase().includes(q) ||
            pageName(t.path).toLowerCase().includes(q)),
      ),
    );
  }, [all, notebook, due, showDone, view, query, today]);

  return (
    <div className="tasks-view">
      <header className="tasks-head">
        <div className="layout-switch" role="radiogroup" aria-label="Show tasks as">
          {(['list', 'board'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => {
                setView(v);
              }}
            >
              {v === 'list' ? 'List' : 'Board'}
            </button>
          ))}
        </div>
      </header>
      <div className="tasks-filters">
        <input
          type="search"
          aria-label="Find a task"
          placeholder="Find a task"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
        <select
          aria-label="Notebook"
          value={notebook}
          onChange={(e) => {
            setNotebook(e.target.value);
          }}
        >
          <option value="">All notebooks</option>
          {notebooks.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select
          aria-label="Due"
          value={due}
          onChange={(e) => {
            setDue(e.target.value as DueFilter);
          }}
        >
          {DUE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {view === 'list' && (
          <label className="choice">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(e) => {
                setShowDone(e.target.checked);
              }}
            />
            Show done
          </label>
        )}
      </div>
      {!store.loaded ? (
        <p className="hint">Gathering tasks from your pages…</p>
      ) : view === 'list' ? (
        <TaskList ctx={ctx} store={store} tasks={shown} today={today} />
      ) : (
        <TaskBoard ctx={ctx} store={store} tasks={shown} today={today} />
      )}
      <p className="hint">
        Tasks are checklist items in your pages. Add a due date with 📅 and a date, such as 📅{' '}
        {today}.
      </p>
    </div>
  );
}

/** Beside pages: what is due today or overdue, wherever it is written. */
export function DueToday({ ctx, store }: { ctx: ModuleContext; store: TaskStore }) {
  const all = useTasks(store);
  const today = dayOf(new Date());
  const due = sortTasks(all.filter((t) => t.state !== 'done' && dueFits(t, 'today', today)));
  return (
    <div className="tasks-side">
      {due.length === 0 ? (
        <p className="hint">Nothing due today.</p>
      ) : (
        <TaskList ctx={ctx} store={store} tasks={due} today={today} />
      )}
      <button type="button" className="quiet" onClick={() => void ctx.app.openView('tasks.view')}>
        All tasks
      </button>
    </div>
  );
}
