import { createElement } from 'react';
import { Calculator, FlaskConical, Timer } from 'lucide-react';
import { defineModule } from '@core/api';
import { LabToolsView } from './LabToolsView';
import { TimerStore } from './timers';
import { TimersCard } from './TimersTool';
import './lab-tools.css';

/**
 * The Lab tools module: calculators for solutions, molecular biology and
 * cells, a unit converter, and bench timers. Beside a page, answers can be
 * added to it. Only running timers are stored, in the module's own folder.
 */

const VIEW = 'lab-tools.view';

export default defineModule({
  activate(ctx) {
    const timers = new TimerStore(ctx);
    void timers.load();
    ctx.onDispose(() => {
      timers.dispose();
    });

    ctx.views.registerPageView({
      id: VIEW,
      title: 'Lab tools',
      render: (tool) => createElement(LabToolsView, { ctx, timers, initial: tool }),
      tool: {
        icon: createElement(FlaskConical, { size: 18, strokeWidth: 1.75, 'aria-hidden': true }),
        hint: 'Calculators, conversions and timers',
      },
    });
    ctx.views.registerSideTab({
      id: 'lab-tools.side',
      title: 'Lab tools',
      icon: createElement(Calculator, { size: 17, strokeWidth: 1.75, 'aria-hidden': true }),
      render: () => createElement(LabToolsView, { ctx, timers, beside: true }),
    });
    ctx.views.registerHomeCard({
      id: 'lab-tools.timers',
      title: 'Timers',
      icon: createElement(Timer, { size: 17, strokeWidth: 1.75, 'aria-hidden': true }),
      render: () =>
        createElement(TimersCard, {
          store: timers,
          onOpen: () => void ctx.app.openView(VIEW, 'timers'),
        }),
    });
    ctx.commands.register({
      id: 'lab-tools.open',
      title: 'Open lab tools',
      run: () => ctx.app.openView(VIEW),
    });
    ctx.commands.register({
      id: 'lab-tools.timer',
      title: 'Start a timer',
      run: () => ctx.app.openView(VIEW, 'timers'),
    });
  },
});
