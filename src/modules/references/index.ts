import { createElement, Fragment } from 'react';
import { defineModule } from '@core/api';
import { describe, searchLibrary } from './library';
import { OutlineBuilder } from './OutlineBuilder';
import type { BranchOutline } from '../mind-maps/branchOutline';
import { DraftEvidence } from './DraftEvidence';
import { LibraryPanel } from './LibraryPanel';
import { openNote, referenceType } from './notes';
import { ReferencesSettings } from './SettingsPanel';
import { LibraryState } from './state';
import { ReadingDesk, HighlightToMap } from './ReadingDesk';
import { evidenceType, READING, type CaptureMode } from './evidence';
import { manuscriptType } from '../manuscript/manuscripts';
import { sectionType } from '../manuscript/workspace';
import { ManuscriptSettings } from '../manuscript/SettingsPanel';
import { Overview } from '../manuscript/Overview';
import { PdfReader } from '../handwriting/PdfReader';
import '../handwriting/handwriting.css';
import { BookOpen, Library } from 'lucide-react';

/**
 * The References module: citations from a Zotero library, through the CSL
 * JSON file Better BibTeX keeps up to date in the vault. Citations are
 * written `[@key]`, Pandoc's form, so switching the module off leaves them
 * as they are; they then show as their keys.
 */
export default defineModule({
  async activate(ctx) {
    const library = new LibraryState(ctx);
    ctx.views.registerPageView({
      id: 'references.branchOutline',
      title: 'Branch to writing outline',
      render: (param) =>
        param
          ? createElement(OutlineBuilder, { ctx, outline: JSON.parse(param) as BranchOutline })
          : 'Select a branch in an editable mind map.',
    });
    ctx.views.registerPageView({
      id: 'references.zoteroLibrary',
      title: 'Zotero references',
      render: () => createElement(LibraryPanel, { ctx, library, fullPage: true }),
      tool: {
        icon: createElement(Library, { size: 18 }),
        hint: 'Browse references and download papers',
      },
    });
    ctx.pageTypes.register(evidenceType());
    ctx.pageTypes.register(manuscriptType());
    ctx.pageTypes.register({
      ...sectionType(),
      renderAside: (path) => createElement(DraftEvidence, { ctx, path }),
    });
    ctx.files.register({
      id: 'references.pdf',
      extensions: ['.pdf'],
      fallback: true,
      name: 'PDF',
      watchesFile: true,
      penTools: true,
      render: ({ path }) => createElement(PdfReader, { ctx, path }),
    });
    ctx.views.registerPageView({
      id: 'references.writing',
      title: 'Reading and writing',
      render: (path) =>
        createElement(ReadingDesk, { ctx, library, param: null, writing: path ?? '' }),
    });
    ctx.views.registerPageView({
      id: 'references.overview',
      title: 'Manuscript',
      render: (path) => createElement(Overview, { ctx, path }),
    });
    ctx.views.registerPageView({
      id: READING,
      title: 'Reading and writing',
      render: (param) => createElement(ReadingDesk, { key: param, ctx, library, param }),
      tool: {
        icon: createElement(BookOpen, { size: 18 }),
        hint: 'PDFs, highlights and linked evidence notes',
      },
    });
    ctx.views.registerPageView({
      id: 'references.mapEvidence',
      title: 'Send to mind map',
      render: (param) => createElement(HighlightToMap, { ctx, library, param }),
    });
    ctx.reading.register({
      id: 'references.sendToMap',
      title: 'Send to mind map',
      run: (excerpt) =>
        ctx.app.openView('references.mapEvidence', JSON.stringify({ ...excerpt, mode: 'excerpt' })),
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
      render: () =>
        createElement(
          Fragment,
          null,
          createElement(ReferencesSettings, { ctx, library }),
          createElement(ManuscriptSettings, { ctx }),
        ),
    });

    await library.start();
  },
});
