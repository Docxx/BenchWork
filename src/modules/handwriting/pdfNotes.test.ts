// @vitest-environment node
import type { InkStroke } from '@core/api';
import {
  emptyNotes,
  highlightBoxes,
  notesPath,
  pageNotes,
  parseNotes,
  scaleStrokes,
  serialiseNotes,
  withPage,
} from './pdfNotes';

const stroke: InkStroke = {
  id: 's1',
  tool: 'pen',
  colour: '#2f5fb3',
  width: 2,
  points: [
    [10.123, 20, 0.5, 0],
    [30, 40.987, 0.6, 8],
  ],
};

describe('notes on a PDF', () => {
  it('are kept beside it', () => {
    expect(notesPath('Papers/smith2024.pdf')).toBe('Papers/smith2024.pdf.annot.json');
  });

  it('keep ink and highlights per page, and read back as written', () => {
    let notes = withPage(emptyNotes(), 3, { strokes: [stroke] });
    notes = withPage(notes, 1, {
      highlights: [
        { id: 'h1', colour: '#ffd84d', rects: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.02 }], text: 'tau' },
      ],
    });
    const text = serialiseNotes(notes);
    expect(text.indexOf('"1"')).toBeLessThan(text.indexOf('"3"'));
    const back = parseNotes(text);
    expect(back).not.toBeNull();
    expect(pageNotes(back ?? emptyNotes(), 3).strokes[0]?.points[0]).toEqual([10.12, 20, 0.5, 0]);
    expect(pageNotes(back ?? emptyNotes(), 1).highlights[0]?.text).toBe('tau');
    expect(serialiseNotes(back ?? emptyNotes())).toBe(text);
  });

  it('drop a page left with nothing, and never read a file that is not notes', () => {
    const notes = withPage(withPage(emptyNotes(), 2, { strokes: [stroke] }), 2, { strokes: [] });
    expect(notes.pages).toEqual({});
    expect(parseNotes('not json')).toBeNull();
    expect(parseNotes('[]')).toBeNull();
    expect(parseNotes('{"pages":{"x":{},"2":{"strokes":[{"id":"a","points":[]}]}}}')).toEqual({
      version: 1,
      pages: { '2': { strokes: [], highlights: [] } },
    });
  });

  it('scale ink between PDF points and the page as shown', () => {
    const shown = scaleStrokes([stroke], 2);
    expect(shown[0]?.points[1]?.slice(0, 2)).toEqual([60, 81.974]);
    expect(scaleStrokes(shown, 0.5)[0]?.points[1]?.slice(0, 2)).toEqual([30, 40.987]);
  });

  it('turn a text selection into highlight boxes as fractions of the page', () => {
    const page = { x: 100, y: 50, w: 400, h: 600 };
    expect(
      highlightBoxes(
        [
          { x: 140, y: 110, w: 200, h: 12 },
          { x: 0, y: 0, w: 0.5, h: 0.5 },
        ],
        page,
      ),
    ).toEqual([{ x: 0.1, y: 0.1, w: 0.5, h: 0.02 }]);
  });
});
