import { createElement } from 'react';
import { TestTubes } from 'lucide-react';
import { defineModule } from '@core/api';
import { SamplesView } from './SamplesView';
export default defineModule({
  activate(ctx) {
    ctx.views.registerPageView({
      id: 'sample-tracker.view',
      title: 'Sample Tracker',
      render: (initial) => createElement(SamplesView, { ctx, initial }),
      tool: {
        icon: createElement(TestTubes, { size: 18, 'aria-hidden': true }),
        hint: 'Sample lineage, storage, treatments and data',
      },
    });
    ctx.files.register({
      id: 'sample-tracker.sample',
      extensions: ['.sample.yaml'],
      name: 'Sample',
      watchesFile: true,
      render: ({ path }) => createElement(SamplesView, { ctx, initial: path }),
    });
  },
});
