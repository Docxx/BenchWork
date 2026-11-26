import { createElement } from 'react';
import { Tags } from 'lucide-react';
import { defineModule, LabelStudio } from '@core/api';
import { labelWorkspace } from './workspace';

const timers: ReturnType<typeof setTimeout>[] = [];
/** Seconds after start to try the phone again, while Cloud sync wakes up. */
const TRIES = [0, 5, 15, 30, 60, 120];

export default defineModule({
  activate(ctx) {
    const workspace = labelWorkspace(ctx);
    // Catch the phone up at start, so labels are there without opening the
    // studio first. Reading the library is what sends anything new. Cloud sync
    // takes a moment to come up, so try again for a while before giving up.
    for (const seconds of TRIES) {
      timers.push(
        setTimeout(() => {
          if (seconds > 0 && !ctx.cards.available()) return;
          void workspace.list().catch((err: unknown) => {
            console.warn('[labels] Could not read the label library', err);
          });
        }, seconds * 1000),
      );
    }
    ctx.views.registerPageView({
      id: 'labels.studio',
      title: 'Label Studio',
      tool: {
        icon: createElement(Tags, { size: 18 }),
        hint: 'Templates, QR codes and B3S label printing',
      },
      render: (param) =>
        createElement(LabelStudio, {
          key: param ?? '',
          workspace,
          transport: ctx.labelBluetooth,
          open: param,
        }),
    });
  },
  deactivate() {
    for (const timer of timers.splice(0)) clearTimeout(timer);
  },
});
