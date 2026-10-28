/**
 * Tasks are checklist items in pages, as written in Markdown:
 * `- [ ] Order fly food 📅 2026-11-02`. A due date follows 📅, and a task
 * being worked on carries `#doing`. Nothing is stored apart from the pages,
 * so with the module off, they are ordinary checklists.
 */

export type TaskState = 'todo' | 'doing' | 'done';

export interface Task {
  /** The page it is on. */
  path: string;
  /** Its line in the page's text, counting from 0. */
  line: number;
  /** The whole line as written, to check it has not changed before writing. */
  raw: string;
  /** What it says, without its box, due date or `#doing`. */
  text: string;
  state: TaskState;
  /** `YYYY-MM-DD`, or null. */
  due: string | null;
  /** Its other tags, without `#`. */
  tags: string[];
}

const TASK = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]\s?(.*)$/;
const DUE = /\s*📅\s*(\d{4}-\d{2}-\d{2})/u;
const DOING = /(^|\s)#doing(?=\s|$)/;
const TAG = /(?:^|\s)#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** Every task in a page's text, in order. Code blocks are left alone. */
export function readTasks(path: string, text: string): Task[] {
  const tasks: Task[] = [];
  let fence: string | null = null;
  text.split(/\r?\n/).forEach((raw, line) => {
    const opener = FENCE.exec(raw)?.[1];
    if (fence !== null) {
      if (opener !== undefined && opener[0] === fence[0] && opener.length >= fence.length) {
        fence = null;
      }
      return;
    }
    if (opener !== undefined) {
      fence = opener;
      return;
    }
    const m = TASK.exec(raw);
    if (!m) return;
    const body = m[3] ?? '';
    const done = (m[2] ?? ' ').toLowerCase() === 'x';
    const doing = DOING.test(body);
    const due = DUE.exec(body)?.[1] ?? null;
    const tags = [...body.matchAll(TAG)]
      .map((t) => t[1] ?? '')
      .filter((t) => t !== '' && t !== 'doing');
    tasks.push({
      path,
      line,
      raw,
      text: body.replace(DUE, '').replace(DOING, '$1').replace(/\s+/g, ' ').trim(),
      state: done ? 'done' : doing ? 'doing' : 'todo',
      due,
      tags,
    });
  });
  return tasks;
}

/** A task's line written with a new state and due date, keeping the rest as it was. */
export function writeTask(raw: string, state: TaskState, due: string | null): string {
  const m = TASK.exec(raw);
  if (!m) return raw;
  let body = (m[3] ?? '').replace(DUE, '').replace(DOING, '$1').replace(/\s+$/, '');
  if (state === 'doing') body = `${body} #doing`;
  if (due !== null) body = `${body} 📅 ${due}`;
  return `${m[1] ?? '- '}[${state === 'done' ? 'x' : ' '}] ${body.replace(/^\s+/, '')}`;
}

/**
 * The page's text with one task changed. Null if the line is no longer the
 * task it was, as when the page changed meanwhile, so nothing is written.
 */
export function changeTask(
  text: string,
  task: Task,
  state: TaskState,
  due: string | null,
): string | null {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  if (lines[task.line] !== task.raw) return null;
  lines[task.line] = writeTask(task.raw, state, due);
  return lines.join(newline);
}

/** A date as `YYYY-MM-DD`, in local time. */
export function dayOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';

/** Whether a task's due date fits a filter, seen from `today` (`YYYY-MM-DD`). */
export function dueFits(task: Task, filter: DueFilter, today: string): boolean {
  if (filter === 'all') return true;
  if (filter === 'none') return task.due === null;
  if (task.due === null) return false;
  if (filter === 'overdue') return task.due < today;
  if (filter === 'today') return task.due <= today;
  const end = new Date(`${today}T12:00:00`);
  end.setDate(end.getDate() + 7);
  return task.due <= dayOf(end);
}

/** Tasks in the order to show them: by due date, undated last, then by page. */
export function sortTasks(tasks: readonly Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
      a.path.localeCompare(b.path) ||
      a.line - b.line,
  );
}
