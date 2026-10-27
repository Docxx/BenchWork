// @vitest-environment node
import { documentToFree, freeFromMarkdown, freeToDocument, freeToMarkdown } from './storage';

const PAGE = [
  '<!-- box x=40 y=120 w=420 -->',
  '## Meeting',
  '',
  '- Order **fly food**',
  '- See [[Plan]]',
  '',
  '<!-- box x=520 y=60 w=300 -->',
  'A note on the side.',
  '',
].join('\n');

describe('free layout storage', () => {
  it('reads boxes and their places, and writes them back unchanged', () => {
    const doc = freeFromMarkdown(PAGE);
    expect(doc.content?.map((b) => b.attrs)).toEqual([
      { x: 40, y: 120, w: 420 },
      { x: 520, y: 60, w: 300 },
    ]);
    expect(doc.content?.[0]?.content?.map((b) => b.type)).toEqual(['heading', 'bulletList']);
    expect(freeToMarkdown(doc)).toBe(PAGE);
  });

  it('keeps text written before any box, as a box at the top', () => {
    const doc = freeFromMarkdown('Written in Obsidian.\n\n<!-- box x=10 y=300 w=200 -->\nLater.\n');
    expect(doc.content?.map((b) => b.attrs)).toEqual([
      { x: 0, y: 0, w: 420 },
      { x: 10, y: 300, w: 200 },
    ]);
  });

  it('turns a free page into a document in reading order, and back into one box', () => {
    const doc = freeFromMarkdown(PAGE);
    const blocks = freeToDocument(doc);
    // The side note is higher on the page, so it comes first.
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'heading', 'bulletList']);
    expect(documentToFree(blocks).content).toHaveLength(1);
  });
});
