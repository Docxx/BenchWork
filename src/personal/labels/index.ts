import { createElement } from 'react';
import { Tags } from 'lucide-react';
import { defineModule, LabelStudio } from '@core/api';
import { labelWorkspace } from './workspace';
export default defineModule({
  activate(ctx) {
    const workspace = labelWorkspace(ctx);
    ctx.views.registerPageView({
      id: 'labels.studio',
      title: 'Label Studio',
      tool: {
        icon: createElement(Tags, { size: 18 }),
        hint: 'Templates, QR codes and B3S label printing',
      },
      render: () => createElement(LabelStudio, { workspace, transport: ctx.labelBluetooth }),
    });
  },
});
