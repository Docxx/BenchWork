import { createElement } from 'react';
import { LayoutPanelTop } from 'lucide-react';
import { defineModule } from '@core/api';
import { FigureEditor } from './FigureEditor';
import { createFigure, FigureList } from './FigureList';
import { FIGURE_ENDING } from './model';

/**
 * Figures: images, grids of images and text placed on a page of real size,
 * lettered and labelled, for papers and talks. Each figure is a
 * `<name>.figure.json` file; the images it uses are never changed.
 */

const LIST = 'figures.list';

export default defineModule({
  activate(ctx) {
    ctx.views.registerPageView({
      id: LIST,
      title: 'Figures',
      render: () => createElement(FigureList, { ctx }),
      tool: {
        icon: createElement(LayoutPanelTop, { size: 18, strokeWidth: 1.75, 'aria-hidden': true }),
        hint: 'Images, grids and labels on a page, for papers and talks',
      },
    });

    ctx.files.register({
      id: 'figures.figure',
      extensions: [FIGURE_ENDING],
      name: 'Figure',
      watchesFile: true,
      hideSidePanel: true,
      render: ({ path }) => createElement(FigureEditor, { key: path, ctx, path }),
    });

    ctx.commands.register({
      id: 'figures.new',
      title: 'New figure',
      places: ['folder'],
      run: async ({ folder }) => {
        if (folder === null) {
          await ctx.app.openView(LIST);
          return;
        }
        const name = await ctx.app.askText({ title: 'New figure', label: 'Figure name' });
        if (name === null || name.trim() === '') return;
        await createFigure(ctx, folder, name);
      },
    });
  },
});
