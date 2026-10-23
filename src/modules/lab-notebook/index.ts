import { defineModule, type ModuleContext } from '@core/api';
import { newProtocol, newVersion, protocolType } from './protocols';

/**
 * The Lab notebook module: protocols with versions, and a daily page laid
 * out for bench work. Daily pages, templates and History come from the
 * core; this adds the lab's own habits. Everything it makes is an ordinary
 * page, so switching it off leaves every page as it is.
 */

export const DAILY_TEMPLATE = 'templates/Daily.md';

export const LAB_DAILY = [
  '# {{date:dddd D MMMM YYYY}}',
  '',
  '## Plan',
  '',
  '- [ ] First task',
  '',
  '## Bench notes',
  '',
  '## Experiments',
  '',
  '## Tomorrow',
  '',
].join('\n');

/** Creates the lab Daily template, never replacing one already there. */
async function setUpDaily(ctx: ModuleContext): Promise<void> {
  if (await ctx.vault.exists(DAILY_TEMPLATE)) {
    ctx.app.notify(
      'There is already a Daily template, so it was left as it is. Open it from Settings > Vault.',
    );
    return;
  }
  await ctx.vault.ensureDir('templates');
  await ctx.vault.createNew(DAILY_TEMPLATE, LAB_DAILY);
  ctx.app.notify('New daily pages now start with Plan, Bench notes and Experiments.');
}

export default defineModule({
  activate(ctx) {
    ctx.pageTypes.register(protocolType());

    ctx.commands.register({
      id: 'lab-notebook.newProtocol',
      title: 'New protocol',
      places: ['folder'],
      run: ({ folder }) => newProtocol(ctx, folder),
    });
    ctx.commands.register({
      id: 'lab-notebook.newVersion',
      title: 'New version of this protocol',
      run: () => newVersion(ctx),
    });
    ctx.commands.register({
      id: 'lab-notebook.setUpDaily',
      title: 'Set up lab daily page',
      run: () => setUpDaily(ctx),
    });
  },
});
