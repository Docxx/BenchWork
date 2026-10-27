import { blocksFromMarkdown } from '../../src/core/editor/markdown/markdown';
import type { PMNode } from '../../src/core/editor/markdown/model';
import { blockToMarkdown } from '../../src/core/editor/markdown/toMarkdown';
import { DEFAULT_WIDTH } from './box';

/**
 * How a free page would be saved: still Markdown, each box's text after
 * an HTML comment giving its place. Markdown viewers hide the comments, so
 * the page reads as a document in reading order.
 *
 *   <!-- box x=40 y=120 w=420 -->
 *   Notes from the meeting...
 */

const MARKER = /^<!-- box x=(-?\d+) y=(-?\d+) w=(\d+) -->[ \t]*$/;

function boxMarker(attrs: Record<string, unknown>): string {
  const n = (v: unknown, fallback: number) => (typeof v === 'number' ? Math.round(v) : fallback);
  return `<!-- box x=${String(n(attrs['x'], 0))} y=${String(n(attrs['y'], 0))} w=${String(n(attrs['w'], DEFAULT_WIDTH))} -->`;
}

/** A free page's body as Markdown. */
export function freeToMarkdown(doc: PMNode): string {
  return (doc.content ?? [])
    .map((box) => {
      const blocks = (box.content ?? []).map((b) => blockToMarkdown(b)).join('\n\n');
      return `${boxMarker(box.attrs ?? {})}\n${blocks}`;
    })
    .join('\n\n')
    .concat('\n');
}

/** Boxes from a free page's Markdown. Text before the first marker becomes a box at the top. */
export function freeFromMarkdown(markdown: string): PMNode {
  const boxes: PMNode[] = [];
  let place = { x: 0, y: 0, w: DEFAULT_WIDTH };
  let lines: string[] = [];
  const flush = () => {
    const text = lines.join('\n').trim();
    lines = [];
    if (text === '') return;
    boxes.push({ type: 'box', attrs: { ...place }, content: blocksFromMarkdown(text) });
  };
  for (const line of markdown.split(/\r?\n/)) {
    const marker = MARKER.exec(line);
    if (marker) {
      flush();
      place = { x: Number(marker[1]), y: Number(marker[2]), w: Number(marker[3]) };
    } else {
      lines.push(line);
    }
  }
  flush();
  return { type: 'doc', content: boxes };
}

/** A document page's blocks as one box at the top, for turning it into a free page. */
export function documentToFree(blocks: PMNode[]): PMNode {
  return {
    type: 'doc',
    content:
      blocks.length === 0
        ? []
        : [{ type: 'box', attrs: { x: 40, y: 40, w: 640 }, content: blocks }],
  };
}

/** A free page's boxes in reading order, as one flowing document. */
export function freeToDocument(doc: PMNode): PMNode[] {
  const order = (b: PMNode) => [Number(b.attrs?.['y'] ?? 0), Number(b.attrs?.['x'] ?? 0)] as const;
  return [...(doc.content ?? [])]
    .sort((a, b) => {
      const [ay, ax] = order(a);
      const [by, bx] = order(b);
      return ay - by || ax - bx;
    })
    .flatMap((box) => box.content ?? []);
}
