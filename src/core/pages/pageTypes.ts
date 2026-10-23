import type { NewPageContent } from '../api';
import { parsePage, serialisePage, updateProperties } from './frontmatter';

/**
 * A new page of a module's type: `id`, `type` and `created` first, then the
 * type's own starting properties, then its body.
 */
export function typedPageText(
  type: string,
  content: NewPageContent,
  id: string,
  created: string,
): string {
  const empty = { ...parsePage(''), eol: '\n' as const };
  const reserved = new Set(['id', 'type', 'created']);
  const extra = Object.fromEntries(
    Object.entries(content.properties ?? {}).filter(([key]) => !reserved.has(key)),
  );
  const page = updateProperties(empty, { id, type, created, ...extra });
  return serialisePage({ ...page, body: content.body ?? '' });
}
