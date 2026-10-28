import { createElement } from 'react';
import { ListChecks } from 'lucide-react';
import { defineModule } from '@core/api';
import { TaskStore } from './store';
import { DueToday, TasksView } from './TasksView';
import './tasks.css';

/**
 * The Tasks module: every checklist item in the vault in one place, as a
 * list or a board. Tasks stay in their pages as `- [ ]` lines, with a due
 * date after 📅 and `#doing` while being worked on; nothing else is stored.
 */

const VIEW = 'tasks.view';

export default defineModule({
  activate(ctx) {
    const store = new TaskStore(ctx);
    void store.load();
    ctx.vault.watch((change) => {
      void store.refresh(change.paths);
    });

    ctx.views.registerPageView({
      id: VIEW,
      title: 'Tasks',
      render: () => createElement(TasksView, { ctx, store }),
    });
    ctx.views.registerSideTab({
      id: 'tasks.due',
      title: 'Due today',
      icon: createElement(ListChecks, { size: 17, strokeWidth: 1.75, 'aria-hidden': true }),
      render: () => createElement(DueToday, { ctx, store }),
    });
    ctx.commands.register({
      id: 'tasks.open',
      title: 'Open tasks',
      run: () => ctx.app.openView(VIEW),
    });
  },
});
