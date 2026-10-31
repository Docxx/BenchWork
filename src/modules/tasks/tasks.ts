/**
 * Tasks are checklist items in pages, as written in Markdown:
 * `- [ ] Order fly food 📅 2026-11-02`. Details follow the text as marks:
 *
 *   📅 2026-11-02   due        🛫 2026-10-30   start
 *   ⏰ 14:00         reminder   🔺 ⏫ 🔼 🔽 ⏬   priority, highest to lowest
 *   📊 40%           progress   @Sam            who it is for
 *   🆔 m1            its id     ⛔ m0,m2        the tasks it waits for, by id
 *
 * and `#doing` while it is being worked on. A reminder is a time
 * (`⏰ 14:00`) on the due date or the daily page's date, or has its own
 * date (`⏰ 2026-11-02 14:00`). Tasks indented under another are its
 * subtasks. Nothing is stored apart from the pages, so with the module off,
 * they are ordinary checklists.
 */

export type TaskState = 'todo' | 'doing' | 'done';
export type Priority = 'highest' | 'high' | 'medium' | 'low' | 'lowest';

/** Each priority's mark, highest first. */
export const PRIORITY_MARKS: Record<Priority, string> = {
  highest: '🔺',
  high: '⏫',
  medium: '🔼',
  low: '🔽',
  lowest: '⏬',
};
export const PRIORITIES = Object.keys(PRIORITY_MARKS) as Priority[];

export interface Task {
  /** The page it is on. */
  path: string;
  /** Its line in the page's text, counting from 0. */
  line: number;
  /** The whole line as written, to check it has not changed before writing. */
  raw: string;
  /** What it says, without its box and marks. */
  text: string;
  state: TaskState;
  /** `YYYY-MM-DD`, or null. */
  due: string | null;
  start: string | null;
  priority: Priority | null;
  /** 0 to 100, or null if not given. */
  progress: number | null;
  /** Who it is for, without `@`. */
  person: string | null;
  /** Its own id, for other tasks to wait for. */
  id: string | null;
  /** Ids of the tasks it waits for. */
  after: string[];
  /** Its other tags, without `#`. */
  tags: string[];
  /** When to remind, as local `YYYY-MM-DDTHH:MM`, or null. */
  remind: string | null;
  /** The line of the task it is indented under, or null. */
  parent: number | null;
}

/** The details a task's marks hold, which can be changed. */
export interface TaskFields {
  state: TaskState;
  due: string | null;
  start: string | null;
  priority: Priority | null;
  progress: number | null;
  person: string | null;
  id: string | null;
  after: string[];
}

const TASK = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]\s?(.*)$/;
const DUE = /\s*📅\s*(\d{4}-\d{2}-\d{2})/u;
const START = /\s*🛫\s*(\d{4}-\d{2}-\d{2})/u;
const PRIORITY = /\s*(🔺|⏫|🔼|🔽|⏬)️?/u;
const PROGRESS = /\s*📊\s*(\d{1,3})\s*%/u;
const PERSON = /(^|\s)@([\p{L}\p{N}][\p{L}\p{N}._-]*)/u;
const ID = /\s*🆔\s*([A-Za-z0-9_-]+)/u;
const AFTER = /\s*⛔\s*([A-Za-z0-9_-]+(?:\s*,\s*[A-Za-z0-9_-]+)*)/gu;
const DOING = /(^|\s)#doing(?=\s|$)/;
const REMIND = /\s*⏰\s*(?:(\d{4}-\d{2}-\d{2})[ T])?(\d{1,2}):(\d{2})/u;
/** The date in a daily page's name, such as `Daily/2026-10/2026-10-30.md`. */
const PAGE_DAY = /(?:^|\/)(\d{4}-\d{2}-\d{2})\.md$/i;

/** When a task's ⏰ reminds, or null: its own date, else its due date, else its page's. */
export function reminderOf(body: string, due: string | null, path: string): string | null {
  const m = REMIND.exec(body);
  if (!m) return null;
  const day = m[1] ?? due ?? PAGE_DAY.exec(path)?.[1] ?? null;
  const hour = Number(m[2]);
  const minute = Number(m[3]);
  if (day === null || hour > 23 || minute > 59) return null;
  return `${day}T${String(hour).padStart(2, '0')}:${m[3] ?? '00'}`;
}
const TAG = /(?:^|\s)#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
/** `[[Target]]` or `[[Target|shown]]`, shown by its name. */
const LINK = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g;

const priorityOf = (mark: string | undefined): Priority | null =>
  PRIORITIES.find((p) => PRIORITY_MARKS[p] === mark) ?? null;

/** How far a line is indented, with a tab as four spaces. */
function indentOf(raw: string): number {
  return (/^\s*/.exec(raw)?.[0] ?? '').replace(/\t/g, '    ').length;
}

/** Every task in a page's text, in order. Code blocks are left alone. */
export function readTasks(path: string, text: string): Task[] {
  const tasks: Task[] = [];
  let fence: string | null = null;
  // Tasks above, still open as parents: indent and line.
  let open: { indent: number; line: number }[] = [];
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
      open = [];
      return;
    }
    const m = TASK.exec(raw);
    if (!m) {
      // Text that is not indented ends the list, and with it the subtasks.
      if (raw.trim() !== '' && indentOf(raw) === 0 && !/^\s*(?:[-*+]|\d+[.)])\s/.test(raw)) {
        open = [];
      }
      return;
    }
    const indent = indentOf(raw);
    while (open.length > 0 && (open.at(-1)?.indent ?? 0) >= indent) open.pop();
    const parent = open.at(-1)?.line ?? null;
    open.push({ indent, line });

    const body = m[3] ?? '';
    const done = (m[2] ?? ' ').toLowerCase() === 'x';
    const doing = DOING.test(body);
    const due = DUE.exec(body)?.[1] ?? null;
    const progress = PROGRESS.exec(body)?.[1];
    const tags = [...body.matchAll(TAG)]
      .map((t) => t[1] ?? '')
      .filter((t) => t !== '' && t !== 'doing');
    tasks.push({
      path,
      line,
      raw,
      text: body
        .replace(DUE, '')
        .replace(START, '')
        .replace(REMIND, '')
        .replace(PRIORITY, '')
        .replace(PROGRESS, '')
        .replace(ID, '')
        .replace(AFTER, '')
        .replace(PERSON, '$1')
        .replace(DOING, '$1')
        .replace(LINK, (_w, target: string, label?: string) => (label ?? target).trim())
        .replace(/\s+/g, ' ')
        .trim(),
      state: done ? 'done' : doing ? 'doing' : 'todo',
      due,
      start: START.exec(body)?.[1] ?? null,
      priority: priorityOf(PRIORITY.exec(body)?.[1]),
      progress: progress === undefined ? null : Math.min(100, Number(progress)),
      person: PERSON.exec(body)?.[2] ?? null,
      id: ID.exec(body)?.[1] ?? null,
      after: [...body.matchAll(AFTER)].flatMap((a) =>
        (a[1] ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== ''),
      ),
      tags,
      remind: reminderOf(body, due, path),
      parent,
    });
  });
  return tasks;
}

/**
 * A task's line with some details changed, keeping the rest as it was.
 * Changed marks move to the end of the line, in a set order.
 */
export function writeFields(raw: string, changes: Partial<TaskFields>): string {
  const m = TASK.exec(raw);
  if (!m) return raw;
  let body = m[3] ?? '';
  let state: TaskState =
    (m[2] ?? ' ').toLowerCase() === 'x' ? 'done' : DOING.test(body) ? 'doing' : 'todo';
  const tail: string[] = [];
  if (changes.person !== undefined) {
    body = body.replace(PERSON, '$1');
    if (changes.person !== null && changes.person.trim() !== '') {
      tail.push(`@${changes.person.trim().replace(/^@/, '').replace(/\s+/g, '-')}`);
    }
  }
  if (changes.state !== undefined) {
    state = changes.state;
    body = body.replace(DOING, '$1');
    if (state === 'doing') tail.push('#doing');
  }
  if (changes.priority !== undefined) {
    body = body.replace(PRIORITY, '');
    if (changes.priority !== null) tail.push(PRIORITY_MARKS[changes.priority]);
  }
  if (changes.progress !== undefined) {
    body = body.replace(PROGRESS, '');
    if (changes.progress !== null) {
      tail.push(`📊 ${String(Math.round(Math.min(100, Math.max(0, changes.progress))))}%`);
    }
  }
  if (changes.id !== undefined) {
    body = body.replace(ID, '');
    if (changes.id !== null && changes.id !== '') tail.push(`🆔 ${changes.id}`);
  }
  if (changes.after !== undefined) {
    body = body.replace(AFTER, '');
    if (changes.after.length > 0) tail.push(`⛔ ${changes.after.join(',')}`);
  }
  if (changes.start !== undefined) {
    body = body.replace(START, '');
    if (changes.start !== null) tail.push(`🛫 ${changes.start}`);
  }
  if (changes.due !== undefined) {
    body = body.replace(DUE, '');
    if (changes.due !== null) tail.push(`📅 ${changes.due}`);
  }
  body = [body.replace(/\s+$/, ''), ...tail].filter((s) => s !== '').join(' ');
  return `${m[1] ?? '- '}[${state === 'done' ? 'x' : ' '}] ${body.replace(/^\s+/, '')}`;
}

/** A task's line written with a new state and due date, keeping the rest as it was. */
export function writeTask(raw: string, state: TaskState, due: string | null): string {
  return writeFields(raw, { state, due });
}

/** A fresh id for a task, not one already in `taken`. */
export function newTaskId(taken: ReadonlySet<string>): string {
  for (;;) {
    const id = Math.random().toString(36).slice(2, 6);
    if (!taken.has(id)) return id;
  }
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

/** As changeTask, for any of a task's details. Null if the line has changed meanwhile. */
export function changeTaskFields(
  text: string,
  task: Task,
  changes: Partial<TaskFields>,
): string | null {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  if (lines[task.line] !== task.raw) return null;
  lines[task.line] = writeFields(task.raw, changes);
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
