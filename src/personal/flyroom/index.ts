import { createElement } from 'react';
import { Bug } from 'lucide-react';
import { defineModule } from '@core/api';
import { FlyToday } from './CrossesTab';
import { FlyRoomView } from './FlyRoomView';
import { steps } from './schedule';
import { FlyStore } from './store';
import './flyroom.css';

/**
 * Fly room, a personal module: fly stocks, a cross planner that works out
 * the progeny with their ratios and markers, and crosses tracked from
 * set-up to collecting. Stocks and crosses are small records in the vault.
 */

const VIEW = 'flyroom.view';

export default defineModule({
  activate(ctx) {
    const store = new FlyStore(ctx);
    void store.load();
    ctx.vault.watch((change) => {
      void store.refresh(change.paths);
    });

    ctx.views.registerPageView({
      id: VIEW,
      title: 'Fly room',
      render: (param) => createElement(FlyRoomView, { key: param ?? '', ctx, store, start: param }),
      tool: {
        icon: createElement(Bug, { size: 18, strokeWidth: 1.75, 'aria-hidden': true }),
        hint: 'Fly stocks, cross planner and crosses',
      },
    });

    ctx.views.registerWidget({
      id: 'flyroom.today',
      starts: { home: true },
      title: 'Fly room today',
      icon: createElement(Bug, { size: 17, strokeWidth: 1.75, 'aria-hidden': true }),
      render: () =>
        createElement(FlyToday, {
          store,
          onOpen: () => void ctx.app.openView(VIEW, 'crosses'),
        }),
    });

    // Each cross's steps on the calendar.
    ctx.views.registerCalendarSource({
      id: 'flyroom.crosses',
      title: 'Crosses',
      marks: (from, to) => {
        const { crosses, settings } = store.snapshot();
        return Promise.resolve(
          crosses
            .filter((c) => c.status !== 'Done' && c.status !== 'Failed')
            .flatMap((c) =>
              steps(c.setUp, c.temperature, settings.timings)
                .filter((s) => s.id !== 'collect' && !c.done.includes(s.id))
                .filter((s) => s.date >= from && s.date <= to)
                .map((s) => ({ date: s.date, title: `${c.name}: ${s.title}`, path: c.path })),
            ),
        );
      },
    });
  },
});
