import { createElement } from 'react';
import { ChartGantt } from 'lucide-react';
import { defineModule } from '@core/api';
import type { CalendarMark, ScheduledItem } from '@core/api';
import { moveChanges, readPlan, type PlanTask } from './plan';
import { PlannerView } from './PlannerView';
import './planner.css';

/**
 * The Planner module: pages with `start` and `end`, or a `date`, on a
 * timeline. `milestone: true` marks a milestone and `after: [[Other]]` a
 * dependency. Dragging a bar changes the page's properties; nothing else
 * is stored, so switched off, the pages keep their dates.
 */

const VIEW = 'planner.timeline';

export const PAGES = 'planner.pages';

/** Planned pages as items for the chart, joined to the pages they come after. */
export function pageItems(plan: readonly PlanTask[]): ScheduledItem[] {
  const paths = new Set(plan.map((t) => t.path));
  return plan.map((t) => ({
    key: `${PAGES}:${t.path}`,
    title: t.title,
    path: t.path,
    start: t.start,
    end: t.end,
    milestone: t.milestone,
    progress: Math.min(1, Math.max(0, t.progress / 100)),
    done: t.progress >= 100,
    person: null,
    priority: null,
    notebook: t.notebook,
    after: t.after.filter((p) => paths.has(p)).map((p) => `${PAGES}:${p}`),
    parent: null,
  }));
}

/** Calendar marks for planned pages: one-day pages and milestones, and where others start and end. */
export function planMarks(plan: readonly PlanTask[], from: string, to: string): CalendarMark[] {
  const marks: CalendarMark[] = [];
  const add = (date: string, title: string, task: PlanTask, colour: string) => {
    if (date >= from && date <= to) marks.push({ date, title, path: task.path, colour });
  };
  for (const task of plan) {
    if (task.milestone) add(task.start, `◆ ${task.title}`, task, 'purple');
    else if (task.start === task.end) add(task.start, task.title, task, 'blue');
    else {
      add(task.start, `${task.title} starts`, task, 'blue');
      add(task.end, `${task.title} ends`, task, 'blue');
    }
  }
  return marks;
}

export default defineModule({
  activate(ctx) {
    ctx.views.registerPageView({
      id: VIEW,
      title: 'Planner',
      render: (notebook) => createElement(PlannerView, { ctx, notebook }),
      tool: {
        icon: createElement(ChartGantt, { size: 18, strokeWidth: 1.75, 'aria-hidden': true }),
        hint: 'Dated pages on a timeline',
      },
    });

    // Reading every page's dates is slow on a big vault, so the plan is kept
    // and read again only once a page changes.
    let cached: Promise<PlanTask[]> | null = null;
    const plan = () => (cached ??= readPlan(ctx));
    ctx.vault.watch((change) => {
      if (change.paths.some((p) => p.toLowerCase().endsWith('.md'))) cached = null;
    });

    ctx.views.registerCalendarSource({
      id: 'planner.dates',
      title: 'Planned dates',
      marks: async (from, to) => planMarks(await plan(), from, to),
    });

    ctx.views.registerScheduleSource({
      id: PAGES,
      title: 'Planned pages',
      items: async () => pageItems(await plan()),
      move: async (key, start, end) => {
        const path = key.slice(PAGES.length + 1);
        const task = (await plan()).find((t) => t.path === path);
        if (task) await ctx.app.setPageProperties(path, moveChanges(task, start, end));
        cached = null;
      },
    });

    ctx.commands.register({
      id: 'planner.open',
      title: 'Open planner',
      run: () => ctx.app.openView(VIEW),
    });
    ctx.commands.register({
      id: 'planner.notebook',
      title: 'Plan for this notebook',
      places: ['folder'],
      run: async ({ folder }) => {
        const notebook = folder?.split('/')[0] ?? '';
        await ctx.app.openView(VIEW, notebook === '' ? undefined : notebook);
      },
    });
  },
});
