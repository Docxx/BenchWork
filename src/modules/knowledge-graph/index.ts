import { createElement } from 'react';
import { Network } from 'lucide-react';
import { defineModule } from '@core/api';
import { GraphView } from './GraphView';
import './graph.css';

export default defineModule({
  activate(ctx) {
    const icon = createElement(Network, { size: 18, 'aria-hidden': true });
    ctx.views.registerPageView({
      id: 'knowledge-graph.view',
      title: 'Knowledge graph',
      tool: { icon, hint: 'A constellation of your notes, documents and tags' },
      pageButton: { icon },
      render: (focus) => createElement(GraphView, { ctx, focus }),
    });
    ctx.commands.register({
      id: 'knowledge-graph.open',
      title: 'Open knowledge graph',
      run: () => ctx.app.openView('knowledge-graph.view'),
    });
  },
});
