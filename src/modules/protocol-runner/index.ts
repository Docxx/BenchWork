import { createElement } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { defineModule } from '@core/api';
import { addDays, loadEntries, scheduleItem, stepsOf, text, validDay } from '../research/api';
import { ProtocolRunner } from './ProtocolRunner';

export default defineModule({
  activate(ctx) {
    ctx.views.registerPageView({
      id: 'protocol-runner.view',
      title: 'Protocol Runner',
      render: (initial) => createElement(ProtocolRunner, { ctx, initial }),
      tool: {
        icon: createElement(ClipboardCheck, { size: 18, 'aria-hidden': true }),
        hint: 'Reusable protocols, bench checklists and reviewed schedules',
      },
    });
    for (const kind of ['workflowprotocol', 'run'])
      ctx.files.register({
        id: `protocol-runner.${kind}`,
        extensions: [`.${kind}.yaml`],
        name: kind === 'run' ? 'Run' : 'Protocol template',
        watchesFile: true,
        render: ({ path }) => createElement(ProtocolRunner, { ctx, initial: path }),
      });
    ctx.views.registerScheduleSource({
      id: 'protocol-runner.steps',
      title: 'Protocol steps',
      items: async () => {
        const entries = await loadEntries(ctx);
        return entries
          .filter((e) => e.type === 'run' && validDay(text(e.data['start'])))
          .flatMap((entry) =>
            stepsOf(entry.data['steps']).map((step, index, steps) => ({
              ...scheduleItem(
                'protocol-runner.steps',
                entry,
                addDays(text(entry.data['start']), step.offset),
              ),
              key: `protocol-runner.steps:${entry.path}#${step.id}`,
              title: `${entry.title}: ${step.title}`,
              done: step.done,
              progress: step.done ? 1 : 0,
              after:
                index > 0
                  ? [`protocol-runner.steps:${entry.path}#${steps[index - 1]?.id ?? ''}`]
                  : [],
            })),
          );
      },
      move: () =>
        Promise.reject(
          new Error('Use Review a date change in Protocol Runner to move linked work together.'),
        ),
      subscribe: (listener) => {
        const stop = ctx.vault.watch(() => {
          listener();
        });
        return () => {
          stop.dispose();
        };
      },
    });
  },
});
