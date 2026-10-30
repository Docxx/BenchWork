import { createElement } from 'react';
import { Newspaper } from 'lucide-react';
import { defineModule } from '@core/api';
import { PapersCard, PapersView } from './PapersView';
import { PapersStore } from './store';
import './papers.css';

/**
 * The Latest papers module: topics to follow, each a Europe PMC search, with
 * the newest papers from the last month. Its only use of the internet is
 * www.ebi.ac.uk, named in manifest.json. Topics and the last results are
 * kept in the module's own folder; notes on papers are ordinary pages.
 */

const VIEW = 'papers.view';

export default defineModule({
  activate(ctx) {
    const store = new PapersStore(ctx);
    void store.load();

    ctx.views.registerPageView({
      id: VIEW,
      title: 'Latest papers',
      render: () => createElement(PapersView, { ctx, store }),
      tool: {
        icon: createElement(Newspaper, { size: 18, strokeWidth: 1.75, 'aria-hidden': true }),
        hint: 'New papers on the topics you follow',
      },
    });
    ctx.views.registerHomeCard({
      id: 'papers.latest',
      title: 'Latest papers',
      icon: createElement(Newspaper, { size: 17, strokeWidth: 1.75, 'aria-hidden': true }),
      wide: true,
      render: () =>
        createElement(PapersCard, { ctx, store, onOpen: () => void ctx.app.openView(VIEW) }),
    });
    ctx.commands.register({
      id: 'papers.open',
      title: 'Latest papers',
      run: () => ctx.app.openView(VIEW),
    });
    ctx.commands.register({
      id: 'papers.refresh',
      title: 'Look for new papers',
      run: () => store.refreshAll(),
    });
  },
});
