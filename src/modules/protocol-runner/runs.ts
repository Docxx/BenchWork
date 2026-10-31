import type { ModuleContext } from '@core/api';
import {
  addDays,
  blankStep,
  dayDifference,
  link,
  readEntry,
  saveEntry,
  stepsOf,
  text,
  today,
  validDay,
  type Entry,
  type WorkflowStep,
} from '../research/api';

export function protocolSteps(entry: Entry): WorkflowStep[] {
  const saved = stepsOf(entry.data['steps']);
  if (Array.isArray(entry.data['steps'])) return saved;
  let body = text(entry.data['instructions']);
  if (entry.path.endsWith('.md')) {
    body = entry.source.replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(?:\r?\n|$)/, '');
    const section = /(?:^|\n)##?\s+Steps\s*\n([\s\S]*?)(?=\n##?\s|$)/i.exec(body);
    if (section) body = section[1] ?? '';
  }
  let fenced = false;
  return body.split(/\r?\n/).flatMap((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return [];
    }
    if (fenced) return [];
    const match = /^\s*(?:\d+[.)]|[-*])\s+(?:\[[ xX]\]\s*)?(.+)/.exec(line);
    const title = (
      entry.path.endsWith('.md') ? match?.[1] : line.replace(/^\s*(?:\d+[.)]|[-*])\s+/, '')
    )?.trim();
    return title ? [blankStep(title)] : [];
  });
}

export async function createRun(
  ctx: ModuleContext,
  protocol: Entry,
  experiment: string,
  name: string,
  start: string,
): Promise<string> {
  if (!validDay(start)) throw new Error('Choose a valid start date.');
  const fresh = await readEntry(ctx, protocol);
  if (fresh.error) throw new Error(fresh.error);
  const steps = protocolSteps(fresh);
  if (!steps.length) throw new Error('Add at least one protocol step first.');
  await ctx.vault.ensureDir('Research/Runs');
  return ctx.vault.createRecord('Research/Runs', name, 'run', {
    protocol: link(protocol.path),
    protocolVersion:
      typeof fresh.data['version'] === 'number'
        ? String(fresh.data['version'])
        : text(fresh.data['version']) || '1',
    experiment: experiment ? link(experiment) : '',
    start,
    status: 'planned',
    steps,
  });
}

export function repeatSteps(steps: WorkflowStep[], unfinishedOnly: boolean): WorkflowStep[] {
  return steps
    .filter((step) => !unfinishedOnly || !step.done)
    .map((step) => ({
      ...step,
      id: crypto.randomUUID(),
      done: false,
      completedAt: null,
      notes: '',
    }));
}
export async function repeatRun(
  ctx: ModuleContext,
  entry: Entry,
  unfinishedOnly: boolean,
): Promise<string> {
  const steps = repeatSteps(stepsOf(entry.data['steps']), unfinishedOnly);
  if (!steps.length) throw new Error('There are no unfinished steps to carry forward.');
  await ctx.vault.ensureDir('Research/Runs');
  return ctx.vault.createRecord('Research/Runs', `${entry.title} repeat`, 'run', {
    protocol: entry.data['protocol'] ?? '',
    protocolVersion: entry.data['protocolVersion'] ?? '',
    experiment: entry.data['experiment'] ?? '',
    start: today(),
    status: 'planned',
    previous: link(entry.path),
    steps,
  });
}
export function taskId(entry: Entry, step: WorkflowStep): string {
  return `run-${text(entry.data['id']).replace(/[^a-zA-Z0-9]/g, '')}-${step.id.replace(/[^a-zA-Z0-9]/g, '')}`;
}
export async function exportTasks(ctx: ModuleContext, entry: Entry): Promise<void> {
  if (entry.data['taskPage']) throw new Error('This run already has a linked checklist.');
  const target = text(entry.data['experiment']).replace(/^\[\[|\]\]$/g, '');
  const path = target ? await ctx.app.resolveLink(target, entry.path) : await ctx.app.todayPage();
  if (!path || !path.endsWith('.md'))
    throw new Error('Link an experiment page, or open a daily notebook first.');
  const current = await ctx.vault.readText(path);
  const steps = stepsOf(entry.data['steps']);
  if (!steps.length) throw new Error('Add and save protocol steps before creating a checklist.');
  const marker = `<!-- benchwork-run:${text(entry.data['id'])} -->`;
  if (!current.includes(marker)) {
    const lines = steps.map(
      (step) =>
        `- [${step.done ? 'x' : ' '}] ${step.title.replace(/[\r\n]/g, ' ')} 🆔 ${taskId(entry, step)} 📅 ${addDays(text(entry.data['start']), step.offset)}`,
    );
    await ctx.app.appendToPage(
      path,
      `\n${marker}\n### ${entry.title.replace(/[\r\n]/g, ' ')}\n\n${lines.join('\n')}\n`,
    );
  }
  await saveEntry(ctx, entry, { taskPage: link(path) });
}

export interface DateChange {
  entry: Entry;
  changes: Record<string, unknown>;
  description: string;
  replacement?: string;
}
export interface ScheduleReview {
  run: Entry;
  start: string;
  changes: DateChange[];
  dates: { title: string; before: string; after: string }[];
}
export async function reviewSchedule(
  ctx: ModuleContext,
  run: Entry,
  start: string,
  entries: Entry[],
): Promise<ScheduleReview> {
  const old = text(run.data['start']);
  const delta = dayDifference(old, start);
  const changes: DateChange[] = [
    { entry: run, changes: { start }, description: `Run: ${old} → ${start}` },
  ];
  const dates = stepsOf(run.data['steps'])
    .filter((s) => !s.done)
    .map((s) => ({
      title: s.title,
      before: addDays(old, s.offset),
      after: addDays(start, s.offset),
    }));
  for (const booking of entries.filter(
    (e) => e.type === 'booking' && e.data['status'] !== 'cancelled',
  )) {
    const target = text(booking.data['run']).replace(/^\[\[|\]\]$/g, '');
    if (!target || (await ctx.app.resolveLink(target, booking.path)) !== run.path) continue;
    const before = text(booking.data['start']);
    const end = text(booking.data['end']);
    if (!validDay(before.slice(0, 10)) || !validDay(end.slice(0, 10)))
      throw new Error(`Correct the dates in ${booking.title} first.`);
    const next = addDays(before.slice(0, 10), delta) + before.slice(10);
    const nextEnd = addDays(end.slice(0, 10), delta) + end.slice(10);
    changes.push({
      entry: booking,
      changes: { start: next, end: nextEnd },
      description: `Booking ${booking.title}: ${before} → ${next}`,
    });
  }
  const taskTarget = text(run.data['taskPage']).replace(/^\[\[|\]\]$/g, '');
  const taskPath = taskTarget ? await ctx.app.resolveLink(taskTarget, run.path) : null;
  if (taskPath) {
    const task = await readEntry(ctx, {
      path: taskPath,
      title: 'Linked checklist',
      type: 'page',
      changed: null,
    });
    let updated = task.source;
    for (const step of stepsOf(run.data['steps']).filter((s) => !s.done)) {
      updated = updated
        .split('\n')
        .map((line) =>
          line.includes(`🆔 ${taskId(run, step)} `) && !/^\s*- \[[xX]\]/.test(line)
            ? line.replace(/📅 \d{4}-\d{2}-\d{2}/, `📅 ${addDays(start, step.offset)}`)
            : line,
        )
        .join('\n');
    }
    if (updated !== task.source)
      changes.push({
        entry: task,
        changes: {},
        replacement: updated,
        description: 'Update dates on the linked checklist',
      });
  }
  return { run, start, changes, dates };
}

export async function applySchedule(ctx: ModuleContext, review: ScheduleReview): Promise<void> {
  for (const change of review.changes) {
    if ((await ctx.vault.readText(change.entry.path)) !== change.entry.source)
      throw new Error('A linked record changed. Review the schedule again before applying it.');
  }
  // Check overlap against current bookings, including bookings not present when review began.
  const all = await ctx.app.items();
  for (const change of review.changes.filter((c) => c.entry.type === 'booking')) {
    const start = text(change.changes['start']);
    const end = text(change.changes['end']);
    for (const item of all.filter(
      (i) => i.type === 'booking' && !review.changes.some((c) => c.entry.path === i.path),
    )) {
      const other = await readEntry(ctx, item);
      if (other.data['status'] === 'cancelled') continue;
      const a = text(change.entry.data['equipment']).replace(/^\[\[|\]\]$/g, '');
      const b = text(other.data['equipment']).replace(/^\[\[|\]\]$/g, '');
      if (
        a &&
        b &&
        (await ctx.app.resolveLink(a, change.entry.path)) ===
          (await ctx.app.resolveLink(b, other.path)) &&
        start < text(other.data['end']) &&
        end > text(other.data['start'])
      )
        throw new Error(
          `The proposed dates overlap ${other.title}. Adjust the booking before applying.`,
        );
    }
  }
  const written: { change: DateChange; saved: string | null }[] = [];
  try {
    for (const change of review.changes) {
      if (change.replacement !== undefined) {
        await ctx.vault.keepSnapshot(change.entry.path);
        await ctx.vault.writeText(change.entry.path, change.replacement);
      } else await saveEntry(ctx, change.entry, change.changes);
      const applied = { change, saved: null as string | null };
      written.push(applied);
      applied.saved = await ctx.vault.readText(change.entry.path);
    }
  } catch (error) {
    const failed: string[] = [];
    for (const { change, saved } of written.reverse()) {
      try {
        if (saved === null || (await ctx.vault.readText(change.entry.path)) !== saved)
          throw new Error('Changed during recovery');
        await ctx.vault.writeText(change.entry.path, change.entry.source);
      } catch {
        failed.push(change.entry.title);
      }
    }
    if (failed.length)
      throw new Error(
        `The schedule could not be fully restored: ${failed.join(', ')}. Any newer edits were kept. Recovery copies are in the vault’s .benchwork/snapshots folder.`,
      );
    throw error;
  }
}
