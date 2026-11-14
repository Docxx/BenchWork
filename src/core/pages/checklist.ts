import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import type { RootContent, PhrasingContent } from 'mdast';
import { parsePage } from './frontmatter';

export interface ChecklistItem {
  text: string;
  checked: boolean;
}

function plain(node: PhrasingContent): string {
  if ('value' in node) return node.value;
  if ('children' in node) return node.children.map(plain).join('');
  return node.type === 'image' ? (node.alt ?? '') : '';
}

/** Checkbox labels for summaries. Code blocks and frontmatter are never treated as tasks. */
export function checklistItems(markdown: string): ChecklistItem[] {
  const page = parsePage(markdown);
  if (page.error !== null) return [];
  const tree = fromMarkdown(page.body, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const items: ChecklistItem[] = [];
  const visit = (node: RootContent) => {
    if (node.type === 'listItem' && typeof node.checked === 'boolean') {
      const paragraph = node.children.find((child) => child.type === 'paragraph');
      const text = paragraph?.children.map(plain).join('') ?? '';
      items.push({
        text: text.replace(
          /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
          (_match, target: string, label: string | undefined) => label ?? target,
        ),
        checked: node.checked,
      });
    }
    if ('children' in node) for (const child of node.children) visit(child as RootContent);
  };
  tree.children.forEach(visit);
  return items;
}
