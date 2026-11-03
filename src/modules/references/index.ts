import { createElement } from 'react';
import { defineModule } from '@core/api';
import { describe, searchLibrary } from './library';
import { LibraryPanel } from './LibraryPanel';
import { openNote, referenceType } from './notes';
import { ReferencesSettings } from './SettingsPanel';
import { LibraryState } from './state';
import { ReadingDesk } from './ReadingDesk';
import { evidenceType, READING, type CaptureMode } from './evidence';
import { BookOpen } from 'lucide-react';

/**
 * The References module: citations from a Zotero library, through the CSL
 * JSON file Better BibTeX keeps up to date in the vault. Citations are
 * written `[@key]`, Pandoc's form, so switching the module off leaves them
 * as they are; they then show as their keys.
 */
export default defineModule({
  async activate(ctx) {
    const library = new LibraryState(ctx);
    ctx.pageTypes.register(evidenceType());
    ctx.views.registerPageView({
      id: READING,
      title: 'Reading desk',
      render: (param) => createElement(ReadingDesk, { ctx, library, param }),
      tool: {
        icon: createElement(BookOpen, { size: 18 }),
        hint: 'PDFs, highlights and linked evidence notes',
      },
    });
    const modes: [CaptureMode, string][] = [
      ['excerpt', 'Excerpt + comment'],
      ['structured', 'Structured note'],
      ['linked', 'Link evidence'],
    ];
    for (const [mode, title] of modes)
      ctx.reading.register({
        id: `references.${mode}`,
        title,
        run: (excerpt) => ctx.app.openView(READING, JSON.stringify({ ...excerpt, mode })),
      });

    ctx.citations.register({
      id: 'references.zotero',
      describe: (key) => {
        const ref = library.refs.get(key);
        return ref ? describe(ref) : null;
      },
      // Straight after a vault opens the library may still be loading: wait
      // for it, so the menu does not come up empty.
      suggest: async (query) => {
        await library.ready;
        return searchLibrary(library.refs, query);
      },
      open: (key) => openNote(ctx, library, key),
      bibliography: () => (library.current().status === 'ready' ? library.current().path : null),
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
