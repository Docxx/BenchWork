import { createElement } from 'react';
import { defineModule } from '@core/api';
import { DataGrid } from './DataGrid';
import './data-viewer.css';

/**
 * The Data viewer module: CSV, TSV and Excel files open as editable sheets
 * with simple formulas and quick plots. A copy of each file is kept before
 * it is first changed. Switched off, the files open in the core's
 * read-only preview again.
 */
export default defineModule({
  activate(ctx) {
    ctx.files.register({
      id: 'data-viewer.sheet',
      extensions: ['.csv', '.tsv', '.xlsx', '.xls'],
      name: 'Sheet',
      watchesFile: true,
      render: ({ path }) => createElement(DataGrid, { ctx, path }),
    });
  },
});
