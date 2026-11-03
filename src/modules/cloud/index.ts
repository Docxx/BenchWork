import { createElement } from 'react';
import { Cloud } from 'lucide-react';
import { defineModule } from '@core/api';
import { CloudSession } from './storage';
import { CloudView } from './CloudView';
let session: CloudSession | null = null;
export default defineModule({
  activate(ctx) {
    const transfers = new CloudSession(ctx);
    session = transfers;
    ctx.views.registerPageView({
      id: 'cloud.view',
      title: 'Cloud storage',
      render: () => createElement(CloudView, { ctx, session: transfers }),
      tool: {
        icon: createElement(Cloud, { size: 18 }),
        hint: 'Large datasets in your provider’s storage folders',
      },
    });
  },
  async deactivate() {
    await session?.close();
    session = null;
  },
});
