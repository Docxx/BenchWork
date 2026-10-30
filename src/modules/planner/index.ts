import { createElement } from 'react';
import { ChartGantt } from 'lucide-react';
import { defineModule } from '@core/api';
import type { CalendarMark } from '@core/api';
import { readPlan, type PlanTask } from './plan';
import { PlannerView } from './PlannerView';
import './planner.css';

/**
 * The Planner module: pages with `start` and `end`, or a `date`, on a
 * timeline. `milestone: true` marks a milestone and `after: [[Other]]` a
 * dependency. Dragging a bar changes the page's properties; nothing else
 * is stored, so switched off, the pages keep their dates.
 */

const VIEW = 'planner.timeline';

/** The plan is read again for the calendar at most this often, in ms. */
const PLAN_FRESH_MS = 30_000;

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

    let cached: { at: number; plan: Promise<PlanTask[]> } | null = null;
    ctx.views.registerCalendarSource({
      id: 'planner.dates',
      title: 'Planned dates',
      marks: async (from, to) => {
        if (cached === null || Date.now() - cached.at > PLAN_FRESH_MS) {
          cached = { at: Date.now(), plan: readPlan(ctx) };
        }
        return planMarks(await cached.plan, from, to);
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
