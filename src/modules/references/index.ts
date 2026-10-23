import { createElement } from 'react';
import { defineModule } from '@core/api';
import { describe, searchLibrary } from './library';
import { LibraryPanel } from './LibraryPanel';
import { openNote, referenceType } from './notes';
import { ReferencesSettings } from './SettingsPanel';
import { LibraryState } from './state';

/**
 * The References module: citations from a Zotero library, through the CSL
 * JSON file Better BibTeX keeps up to date in the vault. Citations are
 * written `[@key]`, Pandoc's form, so switching the module off leaves them
 * as they are; they then show as their keys.
 */
export default defineModule({
  async activate(ctx) {
    const library = new LibraryState(ctx);

    ctx.citations.register({
      id: 'references.zotero',
      describe: (key) => {
        const ref = library.refs.get(key);
        return ref ? describe(ref) : null;
      },
      suggest: (query) => searchLibrary(library.refs, query),
      open: (key) => openNote(ctx, library, key),
    });

    ctx.pageTypes.register(referenceType(library));

    ctx.commands.register({
      id: 'references.openNote',
      title: 'Open literature note',
      run: async () => {
        const key = await ctx.app.askText({
          title: 'Open literature note',
          label: 'Citation key',
        });
        if (key !== null && key.trim() !== '') {
          await openNote(ctx, library, key.trim().replace(/^@/, ''));
        }
      },
    });
    ctx.commands.register({
      id: 'references.reload',
      title: 'Reload reference library',
      run: () => library.load(),
    });

    ctx.views.registerSidebarPanel({
      id: 'references.library',
      title: 'Library',
      render: () => createElement(LibraryPanel, { ctx, library }),
    });

    ctx.views.registerSettingsPanel({
      id: 'references.settings',
      render: () => createElement(ReferencesSettings, { ctx, library }),
    });

    await library.start();
  },
});
