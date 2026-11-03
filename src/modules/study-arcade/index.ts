import { createElement } from 'react';
import { Gamepad2 } from 'lucide-react';
import { defineModule } from '@core/api';
import { StudySession } from './session';
import { StudyView } from './StudyView';
let session: StudySession | null = null;
export default defineModule({
  activate(ctx) {
    const current = new StudySession(ctx);
    session = current;
    ctx.views.registerPageView({
      id: 'study-arcade.view',
      title: 'Study Arcade',
      tool: {
        icon: createElement(Gamepad2, { size: 18 }),
        hint: 'Personal quizzes and flashcards',
      },
      render: () => createElement(StudyView, { ctx, session: current }),
    });
  },
  async deactivate() {
    await session?.close();
    session = null;
  },
});
