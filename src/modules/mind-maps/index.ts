import { createElement, lazy, Suspense } from 'react';
import { Network, Waypoints } from 'lucide-react';
import { defineModule } from '@core/api';
import { CANVAS_ENDING } from './canvasFile';
import { CanvasList, createCanvas } from './CanvasList';
import { MindMapView } from './MindMapView';
import './mind-maps.css';

/**
 * The Mind maps and canvas module. A mind map shows the open page's
 * headings and bullet points; it only reads the page. A canvas is a
 * `.canvas.json` file of cards, pages, images and files joined by arrows.
 * Switched off, canvases stay as they are and open as plain files.
 */

const MIND_MAP = 'mind-maps.mindMap';
const CANVASES = 'mind-maps.canvases';

// React Flow is loaded only when a canvas is first opened.
const CanvasEditor = lazy(() => import('./CanvasEditor'));

export default defineModule({
  activate(ctx) {
    ctx.views.registerPageView({
      id: MIND_MAP,
      title: 'Mind map',
      render: (path) => createElement(MindMapView, { ctx, path }),
      pageButton: {
        icon: createElement(Network, { size: 16, strokeWidth: 1.75, 'aria-hidden': true }),
      },
    });
    ctx.views.registerPageView({
      id: CANVASES,
      title: 'Canvases',
      render: () => createElement(CanvasList, { ctx }),
      tool: {
        icon: createElement(Waypoints, { size: 18, strokeWidth: 1.75, 'aria-hidden': true }),
        hint: 'Free boards of cards and arrows',
      },
    });
    ctx.commands.register({
      id: 'mind-maps.mindMap',
      title: 'Mind map of this page',
      run: async () => {
        const path = ctx.app.openPage();
        if (path === null) ctx.app.notify('Open a page first.');
        else await ctx.app.openView(MIND_MAP, path);
      },
    });

    ctx.files.register({
      id: 'mind-maps.canvas',
      extensions: [CANVAS_ENDING],
      name: 'Canvas',
      watchesFile: true,
      render: ({ path }) =>
        createElement(
          Suspense,
          { fallback: createElement('p', { className: 'hint' }, 'Opening the canvas…') },
          createElement(CanvasEditor, { ctx, path }),
        ),
    });
    ctx.commands.register({
      id: 'mind-maps.newCanvas',
      title: 'New canvas',
      places: ['folder'],
      run: async ({ folder }) => {
        if (folder === null) {
          ctx.app.notify('Choose New canvas from a notebook or section menu.');
          return;
        }
        const name = await ctx.app.askText({ title: 'New canvas', label: 'Canvas name' });
        if (name === null || name.trim() === '') return;
        await createCanvas(ctx, folder, name);
      },
    });
  },
});
