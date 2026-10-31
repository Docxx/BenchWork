import type { ScheduledItem } from '@core/api';
import { PRIORITIES, type Task, type TaskFields } from './tasks';

export const SOURCE = 'tasks.tasks';

/** A task's key on the chart: its page, and its id or else its line. */
export function taskKey(task: Task): string {
  return `${SOURCE}:${task.path}#${task.id ?? `L${String(task.line)}`}`;
}

/** The task a key means, among `tasks`. */
export function taskByKey(tasks: readonly Task[], key: string): Task | null {
  return tasks.find((t) => taskKey(t) === key) ?? null;
}

const progressOf = (t: Task): number =>
  t.state === 'done' ? 1 : t.progress !== null ? t.progress / 100 : 0;

/**
 * Tasks with dates, as items for the planner's chart: from 🛫 to 📅, or
 * one day if only one is given. A task without dates whose subtasks have
 * some spans them, as a summary; its progress is theirs, on average.
 */
export function scheduleOf(tasks: readonly Task[]): ScheduledItem[] {
  const byId = new Map(tasks.filter((t) => t.id !== null).map((t) => [t.id, t]));
  const childrenOf = new Map<string, Task[]>();
  const parentKey = (t: Task): string | null => {
    if (t.parent === null) return null;
    const parent = tasks.find((p) => p.path === t.path && p.line === t.parent);
    return parent ? taskKey(parent) : null;
  };
  for (const t of tasks) {
    const p = parentKey(t);
    if (p !== null) childrenOf.set(p, [...(childrenOf.get(p) ?? []), t]);
  }

  const items = new Map<string, ScheduledItem>();
  const build = (t: Task): ScheduledItem | null => {
    const key = taskKey(t);
    const done = items.get(key);
    if (done) return done;
    const parts = (childrenOf.get(key) ?? []).map(build).filter((i) => i !== null);
    let start = t.start ?? t.due;
    let end = t.due ?? t.start;
    let summary = false;
    if (start === null || end === null) {
      if (parts.length === 0) return null;
      start = parts.map((p) => p.start).sort()[0] ?? null;
      end =
        parts
          .map((p) => p.end)
          .sort()
          .at(-1) ?? null;
      summary = true;
      if (start === null || end === null) return null;
    }
    if (end < start) [start, end] = [end, start];
    const item: ScheduledItem = {
      key,
      title: t.text,
      path: t.path,
      start,
      end,
      milestone: false,
      progress: summary
        ? parts.reduce((sum, p) => sum + p.progress, 0) / parts.length
        : progressOf(t),
      done: t.state === 'done',
      person: t.person,
      priority: t.priority === null ? null : PRIORITIES.indexOf(t.priority) + 1,
      notebook: t.path.split('/')[0] ?? '',
      after: t.after
        .map((id) => byId.get(id))
        .filter((w): w is Task => w !== undefined && w !== t)
        .map(taskKey),
      parent: parentKey(t),
      ...(summary ? { summary } : {}),
    };
    items.set(key, item);
    return item;
  };
  tasks.forEach(build);
  // Only links to items that are on the chart.
  return [...items.values()].map((i) => ({
    ...i,
    after: i.after.filter((k) => items.has(k)),
    parent: i.parent !== null && items.has(i.parent) ? i.parent : null,
  }));
}

/** The marks to write for new dates: just 📅 for one day, unless it had a 🛫 already. */
export function datesFor(task: Task, start: string, end: string): Partial<TaskFields> {
  if (start === end && task.start === null) return { due: end };
  return { start, due: end };
}
