import { createElement } from 'react';
import { Lightbulb } from 'lucide-react';
import { defineModule } from '@core/api';
import { QuestionsView } from './QuestionsView';
export default defineModule({
  activate(ctx) {
    ctx.views.registerPageView({
      id: 'research-questions.view',
      title: 'Research Questions',
      render: (initial) => createElement(QuestionsView, { ctx, initial }),
      tool: {
        icon: createElement(Lightbulb, { size: 18, 'aria-hidden': true }),
        hint: 'Questions, evidence and the experiments to try next',
      },
    });
    ctx.files.register({
      id: 'research-questions.question',
      extensions: ['.question.yaml'],
      name: 'Research question',
      watchesFile: true,
      render: ({ path }) => createElement(QuestionsView, { ctx, initial: path }),
    });
  },
});
