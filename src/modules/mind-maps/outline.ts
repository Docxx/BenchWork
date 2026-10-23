/**
 * A page's outline for its mind map: the title at the centre, headings as
 * branches and bullet points under them. Paragraphs, tables and code are
 * left out, so a mind map shows the shape of the page.
 */

export interface OutlineNode {
  text: string;
  /** The heading this node is, or is under, so a click can go to it. */
  heading: string | null;
  children: OutlineNode[];
}

const FRONTMATTER = /^﻿?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const BULLET = /^([ \t]*)(?:[-*+]|\d+[.)])[ \t]+(.*)$/;

/** Markdown inline marks taken out, links shown as their text. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/^\[[ xX]\][ \t]+/, '')
    .replace(/!?\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/!?\[\[([^\]#|]+)(?:#[^\]]*)?\]\]/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|==)(.+?)\1/g, '$2')
    .replace(/([*_])(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/** How deep an indent goes; a tab counts as four spaces. */
function width(indent: string): number {
  return indent.replace(/\t/g, '    ').length;
}

/** The outline of a page's Markdown, under its title. */
export function outlineOf(title: string, markdown: string): OutlineNode {
  const root: OutlineNode = { text: title, heading: null, children: [] };
  /** Open headings, deepest last. */
  const headings: { level: number; node: OutlineNode }[] = [];
  /** Open bullets under the current heading, deepest last. */
  let bullets: { indent: number; node: OutlineNode }[] = [];
  let inCode = false;

  const body = markdown.replace(FRONTMATTER, '');
  for (const line of body.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;

    const heading = HEADING.exec(line);
    if (heading) {
      const level = (heading[1] ?? '#').length;
      const text = plainText(heading[2] ?? '');
      if (text === '') continue;
      // A first heading repeating the title is the centre, not a branch of it.
      if (
        level === 1 &&
        root.children.length === 0 &&
        root.heading === null &&
        text.toLowerCase() === title.toLowerCase()
      ) {
        root.heading = text;
        headings.push({ level, node: root });
        continue;
      }
      while (headings.length > 0 && (headings.at(-1)?.level ?? 0) >= level) headings.pop();
      const node: OutlineNode = { text, heading: text, children: [] };
      (headings.at(-1)?.node ?? root).children.push(node);
      headings.push({ level, node });
      bullets = [];
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      const indent = width(bullet[1] ?? '');
      const text = plainText(bullet[2] ?? '');
      if (text === '') continue;
      while (bullets.length > 0 && (bullets.at(-1)?.indent ?? 0) >= indent) bullets.pop();
      const under = headings.at(-1)?.node ?? root;
      const node: OutlineNode = { text, heading: under.heading, children: [] };
      (bullets.at(-1)?.node ?? under).children.push(node);
      bullets.push({ indent, node });
      continue;
    }

    // A paragraph ends a list, so the next list starts afresh.
    if (line.trim() !== '' && !/^[ \t]/.test(line)) bullets = [];
  }
  return root;
}

/** How many nodes an outline has below its root. */
export function countNodes(node: OutlineNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countNodes(child), 0);
}
