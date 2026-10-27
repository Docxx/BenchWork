import { prosemirrorJSONToYXmlFragment, yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror';
import * as Y from 'yjs';
import { pageSchema } from './extensions';
import type { PMNode } from './markdown/model';

/**
 * Each open page lives in a Yjs document while it is being edited. The file
 * on disk stays the source of truth: the Yjs document is built from it when
 * the page opens, and Markdown is written from it when the page saves. Live
 * co-editing (Phase 6) will share these documents without changing the editor.
 */

/** TipTap's Collaboration extension reads this fragment by default. */
export const FRAGMENT = 'default';

/** Builds a Yjs document holding `doc`. */
export function createPageYDoc(doc: PMNode): Y.Doc {
  const ydoc = new Y.Doc();
  setYDocContent(ydoc, doc);
  return ydoc;
}

/** Replaces the whole content of a page's Yjs document. */
export function setYDocContent(ydoc: Y.Doc, doc: PMNode): void {
  const fragment = ydoc.getXmlFragment(FRAGMENT);
  ydoc.transact(() => {
    fragment.delete(0, fragment.length);
    prosemirrorJSONToYXmlFragment(pageSchema(), withContent(doc), fragment);
  });
}

/** The page model held in a Yjs document. */
export function yDocToPage(ydoc: Y.Doc): PMNode {
  const root = yXmlFragmentToProseMirrorRootNode(ydoc.getXmlFragment(FRAGMENT), pageSchema());
  return root.toJSON() as PMNode;
}

export interface Heading {
  level: number;
  text: string;
}

/** The page's headings, top to bottom, for its outline. Empty headings are left out. */
export function pageHeadings(ydoc: Y.Doc): Heading[] {
  const text = (node: PMNode): string =>
    node.text ?? (node.content ?? []).map((child) => text(child)).join('');
  const headings: Heading[] = [];
  for (const block of yDocToPage(ydoc).content ?? []) {
    if (block.type !== 'heading') continue;
    const words = text(block).trim();
    const level = Number(block.attrs?.['level'] ?? 1);
    if (words !== '') headings.push({ level, text: words });
  }
  return headings;
}

/** ProseMirror needs a doc with at least one block. */
function withContent(doc: PMNode): PMNode {
  return (doc.content ?? []).length > 0 ? doc : { type: 'doc', content: [{ type: 'paragraph' }] };
}
