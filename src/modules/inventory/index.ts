import { createElement } from 'react';
import { Boxes, Repeat } from 'lucide-react';
import { defineModule } from '@core/api';
import { KINDS } from './kinds';
import { FlipsDue, InventoryView, ItemView } from './InventoryView';
import { InventoryStore } from './store';
import './inventory.css';

/**
 * The Inventory module: fly stocks and crosses, reagents and antibodies,
 * each a small record in the Inventory notebook. Fly stocks flipped every
 * few days are listed when due in the page `Inventory/Flips due.md`, as
 * checklist lines that show with other tasks; ticking one records the flip.
 */

const VIEW = 'inventory.view';

export default defineModule({
  activate(ctx) {
    const store = new InventoryStore(ctx);
    void store.load();
    ctx.vault.watch((change) => {
      void store.refresh(change.paths);
    });

    ctx.views.registerPageView({
      id: VIEW,
      title: 'Inventory',
      render: () => createElement(InventoryView, { ctx, store }),
      tool: {
        icon: createElement(Boxes, { size: 18, strokeWidth: 1.75, 'aria-hidden': true }),
        hint: 'Fly stocks, crosses, reagents, antibodies',
      },
    });
    ctx.views.registerHomeCard({
      id: 'inventory.flips',
      title: 'Flips due',
      icon: createElement(Repeat, { size: 17, strokeWidth: 1.75, 'aria-hidden': true }),
      render: () => createElement(FlipsDue, { ctx, store }),
    });
    ctx.commands.register({
      id: 'inventory.open',
      title: 'Open inventory',
      run: () => ctx.app.openView(VIEW),
    });
    ctx.files.register({
      id: 'inventory.item',
      extensions: KINDS.map((k) => `.${k.kind}.yaml`),
      name: 'Inventory item',
      watchesFile: true,
      render: ({ path }) => createElement(ItemView, { ctx, store, path }),
    });
  },
});
