import { defineModule } from '@core/api';

/** What Hello keeps in .benchwork/modules/hello/state.json. */
interface HelloState {
  timesSwitchedOn: number;
}

/**
 * A sample module that proves the module system: it adds a sidebar panel
 * and counts how often it has been switched on in this vault. It writes only
 * to its own private folder, never to the vault's notes or files.
 */
export default defineModule({
  async activate(ctx) {
    const saved = await ctx.storage.read<HelloState>('state.json');
    const state: HelloState = { timesSwitchedOn: (saved?.timesSwitchedOn ?? 0) + 1 };
    await ctx.storage.write('state.json', state);

    const times = state.timesSwitchedOn === 1 ? 'once' : `${String(state.timesSwitchedOn)} times`;
    ctx.views.registerSidebarPanel({
      id: 'hello.panel',
      title: 'Hello',
      render: () => `The Hello module is on. It has been switched on ${times} in this vault.`,
    });
    ctx.log.info('Switched on');
  },

  deactivate() {
    // The panel is removed automatically; nothing else to clean up.
  },
});
