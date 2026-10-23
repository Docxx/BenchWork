import { createElement } from 'react';
import { defineModule, type ModuleContext } from '@core/api';
import { exportManuscript, exportMessage, MANUSCRIPT, manuscriptType } from './manuscripts';
import { Overview } from './Overview';
import { ManuscriptSettings } from './SettingsPanel';

/**
 * The Manuscript module: a manuscript is a page linking to its parts in
 * order. Its overview shows word counts, and Export to Word joins the parts
 * and has Pandoc format the citations from the References library. Pages
 * are never changed by an export; each export is a new file in exports/.
 */

const OVERVIEW = 'manuscript.overview';

/** The open page, if it is a manuscript. */
async function openManuscript(ctx: ModuleContext): Promise<string | null> {
  const path = ctx.app.openPage();
  const props = path === null ? null : await ctx.app.pageProperties(path);
  if (path === null || props?.['type'] !== MANUSCRIPT) {
    ctx.app.notify('Open a manuscript first.');
    return null;
  }
  return path;
}

export default defineModule({
  activate(ctx) {
    ctx.pageTypes.register(manuscriptType());

    ctx.views.registerPageView({
      id: OVERVIEW,
      title: 'Manuscript',
      render: (path) => createElement(Overview, { ctx, path }),
    });

    ctx.commands.register({
      id: 'manuscript.new',
      title: 'New manuscript',
      places: ['folder'],
      run: async ({ folder }) => {
        if (folder === null) {
          ctx.app.notify('Choose New manuscript from a notebook or section menu.');
          return;
        }
        const name = await ctx.app.askText({ title: 'New manuscript', label: 'Manuscript name' });
        if (name !== null && name.trim() !== '') {
          await ctx.app.createPage(folder, name.trim(), MANUSCRIPT);
        }
      },
    });
    ctx.commands.register({
      id: 'manuscript.overview',
      title: 'Manuscript overview',
      run: async () => {
        const path = await openManuscript(ctx);
        if (path !== null) await ctx.app.openView(OVERVIEW, path);
      },
    });
    ctx.commands.register({
      id: 'manuscript.export',
      title: 'Export manuscript to Word',
      run: async () => {
        const path = await openManuscript(ctx);
        if (path === null) return;
        try {
          ctx.app.notify(exportMessage(await exportManuscript(ctx, path)));
        } catch (err) {
          ctx.app.notify(err instanceof Error ? err.message : String(err));
        }
      },
    });

    ctx.views.registerSettingsPanel({
      id: 'manuscript.settings',
      render: () => createElement(ManuscriptSettings, { ctx }),
    });
  },
});
