import { createElement } from 'react';
import { GraduationCap, Presentation, Timer } from 'lucide-react';
import { defineModule } from '@core/api';
import { TeachingSession } from './session';
import { TeachingView } from './TeachingView';
let session: TeachingSession | null = null;
export default defineModule({
  activate(ctx) {
    const current = new TeachingSession(ctx);
    session = current;
    for (const [mode, title, Icon] of [
      ['studio', 'Lesson Studio', GraduationCap],
      ['presenter', 'Presenter Desk', Presentation],
      ['rehearsal', 'Rehearsal Room', Timer],
    ] as const) {
      ctx.views.registerPageView({
        id: `teaching.${mode}`,
        title,
        tool: {
          icon: createElement(Icon, { size: 18 }),
          hint: 'Build, present and practise lessons',
        },
        render: () => createElement(TeachingView, { ctx, session: current, mode }),
      });
    }
  },
  async deactivate() {
    await session?.close();
    session = null;
  },
});
