import type { ModuleContext, NewPageContent, PageTypeSpec } from '@core/api';
import { fullReference, type Reference } from './library';
import type { LibraryState } from './state';

/** Literature notes are pages named by citation key, made here when first opened. */
export const NOTES_FOLDER = 'references';
export const REFERENCE = 'reference';

/** What a new literature note starts with, from its reference. */
export function noteContent(ref: Reference | undefined, key: string): NewPageContent {
  if (!ref) return { properties: { citekey: key }, body: '## Notes\n\n' };
  const properties: Record<string, unknown> = { citekey: ref.key };
  if (ref.title) properties['title'] = ref.title;
  if (ref.authors.length > 0) {
    properties['authors'] = ref.authors.map((a) =>
      a.given ? `${a.family}, ${a.given}` : a.family,
    );
  }
  if (ref.year) properties['year'] = ref.year;
  if (ref.container) properties['journal'] = ref.container;
  if (ref.doi) properties['doi'] = ref.doi;
  return {
    properties,
    body: `# ${ref.title || ref.key}\n\n${fullReference(ref)}\n\n## Notes\n\n`,
  };
}

export function referenceType(library: LibraryState): PageTypeSpec {
  return {
    type: REFERENCE,
    name: 'Literature note',
    fields: [
      { key: 'citekey', label: 'Citation key', kind: 'text' },
      { key: 'authors', label: 'Authors', kind: 'list' },
      { key: 'year', label: 'Year', kind: 'text' },
      { key: 'journal', label: 'Journal', kind: 'text' },
      { key: 'doi', label: 'DOI', kind: 'text' },
    ],
    create: ({ title }) => noteContent(library.refs.get(title), title),
  };
}

/**
 * Opens the literature note for `key`: a page of that name anywhere in the
 * vault, or a new one in references/ if the library has the key.
 */
export async function openNote(
  ctx: ModuleContext,
  library: LibraryState,
  key: string,
): Promise<void> {
  const existing = await ctx.app.resolveLink(key, null);
  if (existing !== null) {
    await ctx.app.open(existing);
    return;
  }
  if (!library.refs.has(key)) {
    ctx.app.notify(`@${key} is not in the reference library, so there is no note to make.`);
    return;
  }
  await ctx.vault.ensureDir(NOTES_FOLDER);
  await ctx.app.createPage(NOTES_FOLDER, key, REFERENCE);
}
