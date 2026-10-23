import { createElement, lazy, Suspense } from 'react';
import { defineModule } from '@core/api';
import { CANVAS_ENDING, emptyCanvas, serialiseCanvas } from './canvasFile';
import { MindMapView } from './MindMapView';
import './mind-maps.css';

/**
 * The Mind maps and canvas module. A mind map shows the open page's
 * headings and bullet points; it only reads the page. A canvas is a
 * `.canvas.json` file of cards, pages, images and files joined by arrows.
 * Switched off, canvases stay as they are and open as plain files.
 */

const MIND_MAP = 'mind-maps.mindMap';

// React Flow is loaded only when a canvas is first opened.
const CanvasEditor = lazy(() => import('./CanvasEditor'));

export default defineModule({
  activate(ctx) {
    ctx.views.registerPageView({
      id: MIND_MAP,
      title: 'Mind map',
      render: (path) => createElement(MindMapView, { ctx, path }),
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
        const file = await ctx.vault.freeName(folder, name.trim(), CANVAS_ENDING);
        const path = `${folder}/${file}`;
        await ctx.vault.createNew(path, serialiseCanvas(emptyCanvas()));
        await ctx.app.open(path);
      },
    });
  },
});
