import { createElement } from 'react';
import { defineModule } from '@core/api';
import { PlannerView } from './PlannerView';
import './planner.css';

/**
 * The Planner module: pages with `start` and `end`, or a `date`, on a
 * timeline. `milestone: true` marks a milestone and `after: [[Other]]` a
 * dependency. Dragging a bar changes the page's properties; nothing else
 * is stored, so switched off, the pages keep their dates.
 */

const VIEW = 'planner.timeline';

export default defineModule({
  activate(ctx) {
    ctx.views.registerPageView({
      id: VIEW,
      title: 'Planner',
      render: (notebook) => createElement(PlannerView, { ctx, notebook }),
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
