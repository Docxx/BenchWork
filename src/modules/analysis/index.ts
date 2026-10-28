import { createElement } from 'react';
import { defineModule } from '@core/api';
import { AnalysisView } from './AnalysisView';
import './analysis.css';

/**
 * The Analysis bridge: the person's own scripts, run with their own Python
 * on a dataset. Results go in a new folder beside the dataset record, with
 * a log of the run, and the record lists them under `analyses`. Datasets
 * come from the Research module. On the computer only.
 */

const VIEW = 'analysis.view';

export default defineModule({
  activate(ctx) {
    ctx.views.registerPageView({
      id: VIEW,
      title: 'Analysis',
      render: (dataset) => createElement(AnalysisView, { ctx, dataset }),
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
});
