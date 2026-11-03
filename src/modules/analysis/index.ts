import { createElement } from 'react';
import { SquareFunction } from 'lucide-react';
import { defineModule } from '@core/api';
import { AnalysisView } from './AnalysisView';
import './analysis.css';
import { AnalysisSession } from './run';
import { RunDetails } from './RunHistory';

/**
 * Runs the person's Python, R or custom scripts on a computer. Each run
 * keeps its provenance beside the dataset; history is readable on tablets too.
 */

const VIEW = 'analysis.view';
let session: AnalysisSession | null = null;

export default defineModule({
  activate(ctx) {
    const runs = new AnalysisSession(ctx);
    session = runs;
    ctx.views.registerPageView({
      id: 'analysis.run',
      title: 'Analysis run',
      render: (path) => createElement(RunDetails, { ctx, path }),
    });
    ctx.views.registerPageView({
      id: VIEW,
      title: 'Analysis',
      render: (dataset) => createElement(AnalysisView, { ctx, dataset, session: runs }),
      tool: {
        icon: createElement(SquareFunction, { size: 18, strokeWidth: 1.75, 'aria-hidden': true }),
        hint: 'Run your scripts on a dataset',
      },
    });
    ctx.commands.register({
      id: 'analysis.open',
      title: 'Run an analysis',
      run: () => {
        const open = ctx.app.openPage();
        return ctx.app.openView(VIEW, open?.endsWith('.dataset.yaml') ? open : undefined);
      },
    });
  },
  async deactivate() {
    await session?.close();
    session = null;
  },
});
