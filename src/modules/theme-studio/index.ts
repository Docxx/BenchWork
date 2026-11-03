import { createElement } from 'react';
import { Palette } from 'lucide-react';
import { defineModule } from '@core/api';
import { ThemeStudio } from './ThemeStudio';
import { ThemeSession } from './session';
let session: ThemeSession | null = null;
export default defineModule({
  activate(ctx) {
    const current = new ThemeSession();
    session = current;
    ctx.views.registerPageView({
      id: 'theme-studio.view',
      title: 'Theme Studio',
      tool: {
        icon: createElement(Palette, { size: 18 }),
        hint: 'Create, save and share an atmosphere',
      },
      render: () => createElement(ThemeStudio, { ctx, session: current }),
    });
  },
  async deactivate() {
    await session?.close();
    session = null;
  },
});
