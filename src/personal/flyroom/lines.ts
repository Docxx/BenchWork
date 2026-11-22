import { text } from './records';
import { addDays } from './schedule';

export const LINE_KIND = 'flyline';
export const LINE_FOLDER = 'Fly room/Transgenic lines';
export const GROUPS = ['Virgin females', 'Other females', 'Males', 'Mixed', 'Other'] as const;
export interface Collection {
  id: string;
  group: string;
  count: string;
  source: string;
  reason: string;
  neededBy?: string;
  actual?: string;
  resolution?: string;
  note?: string;
  carried?: boolean;
}
export interface LineStep {
  id: string;
  title: string;
  days: number;
  collections: Collection[];
  done: boolean;
  completedOn?: string;
  remainderStep?: boolean;
}
export interface LinePlan {
  template?: boolean;
  name: string;
  start: string;
  steps: LineStep[];
}
export interface SavedLine extends LinePlan {
  path: string;
}
export function newStep(): LineStep {
  return { id: crypto.randomUUID(), title: '', days: 0, collections: [], done: false };
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    : [];
}

export function readLine(path: string, data: Record<string, unknown>): SavedLine {
  return {
    path,
    template: data['template'] === true,
    name: text(data['name']) || (path.split('/').pop() || path).replace(/\.flyline\.yaml$/i, ''),
    start: text(data['start']),
    steps: rows(data['steps']).map((s, index) => ({
      id: text(s['id']) || String(index),
      title: text(s['title']),
      days: Math.max(0, Math.floor(Number(s['days']) || 0)),
      done: s['done'] === true,
      completedOn: text(s['completedOn']),
      remainderStep: s['remainderStep'] === true,
      collections: rows(s['collections']).map((c, i) => ({
        id: text(c['id']) || String(i),
        group: c['group'] === 'Females' ? 'Other females' : text(c['group']),
        neededBy: text(c['neededBy']),
        actual: text(c['actual']),
        resolution: text(c['resolution']),
        note: text(c['note']),
        carried: c['carried'] === true,
        count: text(c['count']),
        source: text(c['source']),
        reason: text(c['reason']),
      })),
    })),
  };
}

export function scheduleLine(plan: LinePlan) {
  let day = plan.start;
  return plan.steps.map((step) => {
    const start = day;
    day = addDays(day, step.days);
    const end = day;
    if (step.done && step.completedOn && step.completedOn > end) day = step.completedOn;
    return { step, start, end };
  });
}

export function cleanCopy(plan: LinePlan, start: string, template: boolean): LinePlan {
  return {
    name: template ? plan.name + ' template' : '',
    template,
    start,
    steps: plan.steps
      .filter((s) => !s.remainderStep || s.collections.some((c) => !c.carried))
      .map((s) => ({
        ...s,
        done: false,
        completedOn: '',
        collections: s.collections
          .filter((c) => !c.carried)
          .map((c) => ({
            ...c,
            actual: '',
            resolution: '',
            note: '',
          })),
      })),
  };
}

export function completeStep(plan: LinePlan, current: LineStep, date: string): LinePlan {
  const index = plan.steps.findIndex((s) => !s.done);
  if (plan.template || plan.steps[index]?.id !== current.id)
    throw new Error('Open the next unfinished step.');
  const remainder: Collection[] = [];
  for (const c of current.collections) {
    const actual = Number(c.actual);
    if (!c.actual?.trim() || !Number.isSafeInteger(actual) || actual < 0)
      throw new Error('Enter the actual count for each collection.');
    const missing = Number(c.count) - actual;
    if (missing <= 0) continue;
    if (c.resolution === 'carry') {
      remainder.push({
        ...c,
        id: crypto.randomUUID(),
        count: String(missing),
        actual: '',
        resolution: '',
        note: '',
        carried: true,
      });
    } else if (c.resolution !== 'note' || !c.note?.trim()) {
      throw new Error('Choose how to handle each shortfall and record a note when proceeding.');
    }
  }
  const steps = [...plan.steps];
  steps[index] = { ...current, done: true, completedOn: date };
  if (remainder.length) {
    const following = steps[index + 1] ?? {
      ...newStep(),
      title: 'Collect remainder',
      remainderStep: true,
    };
    steps[index + 1] = { ...following, collections: [...following.collections, ...remainder] };
  }
  return { ...plan, steps };
}
