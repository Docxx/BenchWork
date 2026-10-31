import { createElement } from 'react';
import { AlarmClock, ListChecks, ListTodo } from 'lucide-react';
import { defineModule } from '@core/api';
import { Reminders } from './reminders';
import { RemindersWidget } from './RemindersWidget';
import { datesFor, scheduleOf, SOURCE, taskByKey } from './schedule';
import { TaskStore } from './store';
import { DueToday, TasksView } from './TasksView';
import './tasks.css';

/**
 * The Tasks module: every checklist item in the vault in one place, as a
 * list or a board. Tasks stay in their pages as `- [ ]` lines, with a due
 * date after 📅, a reminder after ⏰, and `#doing` while being worked on.
 * Only which reminders were shown is stored, in the module's own folder.
 */

const VIEW = 'tasks.view';

export default defineModule({
  activate(ctx) {
    const store = new TaskStore(ctx);
    void store.load();
    ctx.vault.watch((change) => {
      void store.refresh(change.paths);
    });
    const reminders = new Reminders(ctx, store);
    void reminders.start();
    ctx.onDispose(() => {
      reminders.stop();
    });

    ctx.views.registerPageView({
      id: VIEW,
      title: 'Tasks',
      render: () => createElement(TasksView, { ctx, store }),
      tool: {
        icon: createElement(ListTodo, { size: 18, strokeWidth: 1.75, 'aria-hidden': true }),
        hint: 'Every checklist, as a list or a board',
      },
    });
    ctx.views.registerWidget({
      id: 'tasks.due',
      title: 'Due today',
      icon: createElement(ListChecks, { size: 17, strokeWidth: 1.75, 'aria-hidden': true }),
      starts: { home: true, side: true },
      render: () => createElement(DueToday, { ctx, store }),
    });
    ctx.views.registerWidget({
      id: 'tasks.reminders',
      title: 'Reminders',
      icon: createElement(AlarmClock, { size: 17, strokeWidth: 1.75, 'aria-hidden': true }),
      starts: { home: true },
      render: () => createElement(RemindersWidget, { ctx, store }),
    });
    ctx.views.registerScheduleSource({
      id: SOURCE,
      title: 'Tasks',
      items: () => Promise.resolve(scheduleOf(store.all())),
      move: async (key, start, end) => {
        const task = taskByKey(store.all(), key);
        if (task) await store.update(task, datesFor(task, start, end));
      },
    });
    ctx.views.registerCalendarSource({
      id: 'tasks.due',
      title: 'Tasks due',
      marks: (from, to) =>
        Promise.resolve(
          store
            .all()
            .filter((t) => t.state !== 'done' && t.due !== null && t.due >= from && t.due <= to)
            .map((t) => ({ date: t.due ?? '', title: t.text, path: t.path, colour: 'orange' })),
        ),
    });
    ctx.commands.register({
      id: 'tasks.open',
      title: 'Open tasks',
      run: () => ctx.app.openView(VIEW),
    });
  },
});
