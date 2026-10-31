import { useId, useState } from 'react';
import type { TaskStore } from './store';
import {
  newTaskId,
  PRIORITIES,
  PRIORITY_MARKS,
  type Priority,
  type Task,
  type TaskFields,
} from './tasks';

const PRIORITY_NAMES: Record<Priority, string> = {
  highest: 'Highest',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  lowest: 'Lowest',
};

/** "Order agar (Plan)", to tell tasks apart. */
const taskName = (t: Task) =>
  `${t.text} (${(t.path.split('/').at(-1) ?? t.path).replace(/\.md$/i, '')})`;

/**
 * A task's details as a form, so nobody has to type 🛫 or ⛔. Saving writes
 * the marks into the task's line; a task it waits for gets an 🆔 if it has
 * none yet.
 */
export function TaskDetails({
  store,
  task,
  tasks,
  onDone,
}: {
  store: TaskStore;
  task: Task;
  /** Every task, to choose what this one waits for. */
  tasks: Task[];
  onDone: () => void;
}) {
  const id = useId();
  const [start, setStart] = useState(task.start ?? '');
  const [due, setDue] = useState(task.due ?? '');
  const [priority, setPriority] = useState<Priority | ''>(task.priority ?? '');
  const [progress, setProgress] = useState(task.progress === null ? '' : String(task.progress));
  const [person, setPerson] = useState(task.person ?? '');
  const others = tasks.filter((t) => !(t.path === task.path && t.line === task.line));
  const [after, setAfter] = useState<Set<string>>(
    () =>
      new Set(
        others
          .filter((t) => t.id !== null && task.after.includes(t.id))
          .map((t) => `${t.path}#${String(t.line)}`),
      ),
  );
  const [saving, setSaving] = useState(false);
  const late = start !== '' && due !== '' && due < start;

  const save = async () => {
    if (late) return;
    setSaving(true);
    try {
      const taken = new Set(tasks.map((t) => t.id).filter((i): i is string => i !== null));
      const waitIds: string[] = [];
      for (const other of others.filter((t) => after.has(`${t.path}#${String(t.line)}`))) {
        if (other.id !== null) {
          waitIds.push(other.id);
          continue;
        }
        const fresh = newTaskId(taken);
        taken.add(fresh);
        await store.update(other, { id: fresh });
        waitIds.push(fresh);
      }
      const percent = progress.trim() === '' ? null : Number(progress);
      const changes: Partial<TaskFields> = {
        start: start === '' ? null : start,
        due: due === '' ? null : due,
        priority: priority === '' ? null : priority,
        progress: percent === null || !Number.isFinite(percent) ? null : percent,
        person: person.trim() === '' ? null : person.trim(),
        after: waitIds,
      };
      // The task itself may have moved down a line if a task above it changed: find it afresh.
      const current = store.all().find((t) => t.path === task.path && t.raw === task.raw) ?? task;
      await store.update(current, changes);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="task-details"
      aria-label={`Details of ${task.text}`}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label htmlFor={`${id}-start`}>Starts</label>
      <input
        id={`${id}-start`}
        type="date"
        value={start}
        onChange={(e) => {
          setStart(e.target.value);
        }}
      />
      <label htmlFor={`${id}-due`}>Due</label>
      <input
        id={`${id}-due`}
        type="date"
        value={due}
        onChange={(e) => {
          setDue(e.target.value);
        }}
      />
      <label htmlFor={`${id}-priority`}>Priority</label>
      <select
        id={`${id}-priority`}
        value={priority}
        onChange={(e) => {
          setPriority(e.target.value as Priority | '');
        }}
      >
        <option value="">None</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_MARKS[p]} {PRIORITY_NAMES[p]}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-progress`}>Progress (%)</label>
      <input
        id={`${id}-progress`}
        type="number"
        min={0}
        max={100}
        step={5}
        value={progress}
        onChange={(e) => {
          setProgress(e.target.value);
        }}
      />
      <label htmlFor={`${id}-person`}>For</label>
      <input
        id={`${id}-person`}
        value={person}
        placeholder="Name"
        onChange={(e) => {
          setPerson(e.target.value);
        }}
      />
      <label htmlFor={`${id}-after`}>Waits for</label>
      <select
        id={`${id}-after`}
        multiple
        size={Math.min(6, Math.max(3, others.length))}
        value={[...after]}
        onChange={(e) => {
          setAfter(new Set([...e.target.selectedOptions].map((o) => o.value)));
        }}
      >
        {others.map((t) => (
          <option key={`${t.path}#${String(t.line)}`} value={`${t.path}#${String(t.line)}`}>
            {taskName(t)}
          </option>
        ))}
      </select>
      {late && (
        <p className="notice task-details-wide" role="alert">
          The due date is before the start.
        </p>
      )}
      <span className="task-details-wide task-details-buttons">
        <button type="submit" disabled={saving || late}>
          Save
        </button>
        <button type="button" className="quiet" onClick={onDone}>
          Cancel
        </button>
      </span>
    </form>
  );
}
