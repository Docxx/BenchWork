import {
  blockAt,
  blockGrid,
  contentBox,
  duplicate,
  fitText,
  heightFor,
  layoutDoc,
  letters,
  letterStrip,
  newDoc,
  newText,
  parseDoc,
  readingOrder,
  restack,
  serialiseDoc,
  type Block,
  type FigureDoc,
  type GridBlock,
  type TextBlock,
} from './doc';
import { insertLine, layout, newGrid, serialiseFigure } from './model';

const grid = (id: string, x: number, y: number, w = 50, h = 40): GridBlock => ({
  id,
  kind: 'grid',
  x,
  y,
  w,
  h,
  letter: null,
  grid: blockGrid(1, 1, w),
});

const text = (id: string, x: number, y: number): TextBlock => ({
  id,
  kind: 'text',
  x,
  y,
  w: 40,
  h: 6,
  letter: null,
  text: newText('Note'),
});

const page = (...blocks: Block[]): FigureDoc => ({ ...newDoc(174), blocks });

describe('reading order and letters', () => {
  it('reads across each row, then down', () => {
    // C sits a little lower than A but starts within A's upper half, so is in its row.
    const doc = page(grid('c', 120, 6), grid('a', 0, 0), grid('b', 60, 0), grid('d', 0, 50));
    expect(readingOrder(doc.blocks).map((b) => b.id)).toEqual(['a', 'b', 'c', 'd']);
    expect([...letters(doc).entries()]).toEqual([
      ['a', 'A'],
      ['b', 'B'],
      ['c', 'C'],
      ['d', 'D'],
    ]);
  });

  it('skips text and parts with no letter, and keeps a letter of its own', () => {
    const doc = page(
      grid('a', 0, 0),
      { ...grid('b', 60, 0), letter: '' },
      text('t', 120, 0),
      { ...grid('c', 0, 50), letter: 'A′' },
      grid('d', 60, 50),
    );
    const shown = letters(doc);
    expect(shown.get('a')).toBe('A');
    expect(shown.get('b')).toBe('');
    expect(shown.get('t')).toBe('');
    expect(shown.get('c')).toBe('A′');
    expect(shown.get('d')).toBe('B');
  });

  it('shows no letters when they are switched off, and lower case on request', () => {
    const doc = page(grid('a', 0, 0), grid('b', 60, 0));
    expect([...letters({ ...doc, letters: { ...doc.letters, show: false } }).values()]).toEqual([
      '',
      '',
    ]);
    expect(letters({ ...doc, letters: { ...doc.letters, form: 'lower' } }).get('b')).toBe('b');
  });
});

describe('where things go', () => {
  it('puts a letter in a strip above a part without labels', () => {
    const doc = page(grid('a', 10, 20));
    const box = contentBox(doc, doc.blocks[0] as Block, 'A');
    expect(box.y).toBeCloseTo(20 + letterStrip(doc));
    expect(box.h).toBeCloseTo(40 - letterStrip(doc));
    expect(contentBox(doc, doc.blocks[0] as Block, '').y).toBe(20);
  });

  it('puts the letter in the corner when a grid has labels at the left and top', () => {
    const a = grid('a', 0, 0, 100, 60);
    const labelled: GridBlock = {
      ...a,
      grid: { ...a.grid, rowLabels: ['w1118'], colLabels: ['DAPI'] },
    };
    const doc = page(labelled);
    expect(contentBox(doc, labelled, 'A').y).toBe(0);
  });

  it('lays a grid out inside its part, below the letter', () => {
    const doc = page(grid('a', 10, 20, 60, 50));
    const l = layoutDoc(doc);
    const panel = l.blocks[0]?.grid?.panels[0];
    expect(panel?.x).toBeCloseTo(10);
    expect(panel?.w).toBeCloseTo(60);
    expect((panel?.y ?? 0) + (panel?.h ?? 0)).toBeCloseTo(70);
    expect(l.height).toBeCloseTo(70);
    expect(blockAt(l, 30, 40)?.block.id).toBe('a');
    expect(blockAt(l, 5, 5)).toBeNull();
  });

  it('grows a part when a row is added, keeping the rows as tall', () => {
    const b: GridBlock = { ...grid('a', 0, 0, 100, 60), grid: blockGrid(2, 2, 100) };
    const doc = page(b);
    const before = layoutDoc(doc).blocks[0]?.grid?.rowHeights[0] ?? 0;
    const next = insertLine(b.grid, 'row', 1);
    const h = heightFor(doc, b, next);
    const after = layout(next, contentBox(doc, { ...b, h, grid: next }, 'A')).rowHeights;
    expect(after).toHaveLength(3);
    for (const r of after) expect(r).toBeCloseTo(before);
  });

  it('fits text to its lines', () => {
    const t = text('t', 0, 0);
    const one = fitText(t, 1);
    const three = fitText(t, 3);
    expect(three.h).toBeGreaterThan(one.h * 2.5);
    expect(fitText({ ...t, text: { ...t.text, upright: true } }, 2).w).toBeCloseTo(fitText(t, 2).h);
  });
});

describe('reading and writing', () => {
  it('opens a figure saved before parts as one grid, looking as it did', () => {
    const old = { ...newGrid(2, 3, 174), rowLabels: ['WT', 'mut'] };
    const doc = parseDoc(serialiseFigure(old));
    expect(doc?.version).toBe(2);
    expect(doc?.width).toBe(174);
    const b = doc?.blocks[0];
    expect(b?.kind).toBe('grid');
    expect(b?.letter).toBe('');
    expect(b?.h).toBeCloseTo(layout(old).height);
    if (b?.kind === 'grid') {
      expect(b.grid.rowLabels).toEqual(['WT', 'mut']);
      // Its panels keep their own letters, as before.
      expect(b.grid.letters.show).toBe(true);
    }
  });

  it('keeps a page as it was through saving and reading', () => {
    const doc = page(grid('a', 0, 0), { ...text('t', 60, 0), letter: 'Z' });
    const again = parseDoc(serialiseDoc(doc));
    expect(again?.blocks.map((b) => [b.id, b.kind, b.x, b.letter])).toEqual([
      ['a', 'grid', 0, null],
      ['t', 'text', 60, 'Z'],
    ]);
  });

  it('turns away what is not a figure, and drops parts it cannot read', () => {
    expect(parseDoc('not json')).toBeNull();
    expect(
      parseDoc('{"version":2,"blocks":[{"kind":"wobble","x":0,"y":0,"w":5,"h":5}]}')?.blocks,
    ).toEqual([]);
  });
});

describe('arranging', () => {
  it('copies a part with new ids inside', () => {
    const doc = page(grid('a', 0, 0));
    const out = duplicate(doc, 'a');
    const copy = out.doc.blocks.find((b) => b.id === out.id);
    expect(out.doc.blocks).toHaveLength(2);
    expect(copy?.x).toBe(4);
    const first = doc.blocks[0];
    if (copy?.kind === 'grid' && first?.kind === 'grid')
      expect(copy.grid.panels[0]?.id).not.toBe(first.grid.panels[0]?.id);
  });

  it('brings a part to the front or sends it to the back', () => {
    const doc = page(grid('a', 0, 0), grid('b', 0, 0));
    expect(restack(doc, 'a', true).blocks.map((b) => b.id)).toEqual(['b', 'a']);
    expect(restack(doc, 'b', false).blocks.map((b) => b.id)).toEqual(['b', 'a']);
  });
});
