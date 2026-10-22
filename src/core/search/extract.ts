import { parseBody } from '../editor/markdown/markdown';
import { RAW_BLOCK, RAW_INLINE, WIKI_LINK, type PMNode } from '../editor/markdown/model';
import { pageTitle } from '../notebooks/notebookTree';
import { parsePage } from '../pages/frontmatter';
import { baseName, type IndexedLink, type IndexedPage } from '../platform';

/**
 * What the search index stores for a page, read with the same rules as the
 * editor: frontmatter keys, the page as plain text, its links and its tags.
 */

/**
 * `#tag` in text: letters, digits, `_`, `-` and `/`, not only digits, and
 * not straight after a letter or digit (so `issue#12` and URLs are not tags).
 */
const TAG = /(?<![\p{L}\p{N}_&#/])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gu;

const INLINE_TYPES = new Set(['text', WIKI_LINK, 'image', 'hardBreak', RAW_INLINE]);

/** Matching key for a link target: lower case, without `#heading`, `^block` or `.md`. */
export function linkKey(target: string): string {
  let key = target.split(/[#^]/)[0] ?? '';
  key = key.replace(/\\/g, '/').trim();
  key = key.replace(/^(\.\/|\/)+/, '');
  key = key.replace(/\.md$/i, '');
  return key.normalize('NFC').toLowerCase();
}

/** The keys a link to this page can have: its full path, or just its name. */
export function pageKeys(path: string): string[] {
  const full = linkKey(path);
  const name = linkKey(baseName(path));
  return full === name ? [full] : [full, name];
}

/** Where tags are in a piece of text: start of the `#`, length, and tag. */
export function tagRanges(text: string): { index: number; length: number; tag: string }[] {
  return [...text.matchAll(TAG)]
    .map((m) => {
      const tag = (m[1] ?? '').replace(/\/+$/, '');
      return { index: m.index, length: tag.length + 1, tag };
    })
    .filter((r) => r.tag !== '');
}

/** Tags in a piece of text, without the `#`. */
export function inlineTags(text: string): string[] {
  return tagRanges(text).map((r) => r.tag);
}

interface Found {
  links: IndexedLink[];
  tags: string[];
}

function attr(node: PMNode, name: string): string {
  const value = node.attrs?.[name];
  return typeof value === 'string' ? value : '';
}

function isCode(node: PMNode): boolean {
  return node.marks?.some((m) => m.type === 'code') === true;
}

/** Plain text of a node, collecting links and tags on the way. */
function plain(node: PMNode, found: Found, inCode: boolean): string {
  switch (node.type) {
    case 'text': {
      const text = node.text ?? '';
      if (!inCode && !isCode(node)) found.tags.push(...inlineTags(text));
      return text;
    }
    case WIKI_LINK: {
      const target = attr(node, 'target');
      const alias = attr(node, 'alias');
      found.links.push({ target, key: linkKey(target), embed: node.attrs?.['embed'] === true });
      return alias !== '' ? alias : target;
    }
    case 'image':
      return attr(node, 'alt');
    case 'hardBreak':
      return '\n';
    case RAW_BLOCK:
    case RAW_INLINE:
      return attr(node, 'markdown');
    default: {
      const children = node.content ?? [];
      const code = inCode || node.type === 'codeBlock';
      const parts = children.map((c) => plain(c, found, code));
      const inline = children.every((c) => INLINE_TYPES.has(c.type));
      return parts.filter((p) => p !== '').join(inline ? '' : '\n');
    }
  }
}

/** Removes repeats, ignoring case; the first spelling wins. */
function unique(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((t) => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Reads a page's text into what the index stores. */
export function extractPage(
  path: string,
  text: string,
  file: { mtime: number | null; size: number },
): IndexedPage {
  const page = parsePage(text);
  const found: Found = { links: [], tags: [] };
  const body = plain(parseBody(page.body).doc, found, false);
  return {
    path,
    id: page.meta.id,
    title: pageTitle(baseName(path)),
    type: page.meta.type,
    created: page.meta.created,
    modified: page.meta.modified,
    mtime: file.mtime,
    size: file.size,
    tags: unique([...page.meta.tags, ...found.tags]),
    links: found.links,
    body,
  };
}
