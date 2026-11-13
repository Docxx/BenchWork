import { createElement } from 'react';
import { Presentation } from 'lucide-react';
import { defineModule } from '@core/api';
import { Board } from './Board';
import { BoardList, createBoard } from './BoardList';
import { BOARD_ENDING } from './model';

/**
 * Whiteboards: endless boards to write and draw on with the pen, a finger
 * or the mouse, with pens, shapes, text, sticky notes, images and PDF
 * pages. Each is a `<name>.board.json` file beside notes; switched off,
 * the files stay as they are.
 */

const LIST = 'whiteboard.list';

export default defineModule({
  activate(ctx) {
    ctx.views.registerPageView({
      id: LIST,
      title: 'Whiteboards',
      render: () => createElement(BoardList, { ctx }),
      tool: {
        icon: createElement(Presentation, { size: 18, strokeWidth: 1.75, 'aria-hidden': true }),
        hint: 'Endless boards to write and draw on',
      },
    });

    ctx.files.register({
      id: 'whiteboard.board',
      extensions: [BOARD_ENDING],
      name: 'Whiteboard',
      watchesFile: true,
      render: ({ path }) => createElement(Board, { key: path, ctx, path }),
    });

    ctx.commands.register({
      id: 'whiteboard.new',
      title: 'New whiteboard',
      places: ['folder'],
      run: async ({ folder }) => {
        if (folder === null) {
          await ctx.app.openView(LIST);
          return;
        }
        const name = await ctx.app.askText({ title: 'New whiteboard', label: 'Whiteboard name' });
        if (name === null || name.trim() === '') return;
        await createBoard(ctx, folder, name);
      },
    });
  },
});
