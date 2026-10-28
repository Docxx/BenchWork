// @vitest-environment node
import {
  emptyInk,
  inkBounds,
  mergeInk,
  parseInk,
  serialiseInk,
  type Ink,
  type InkStroke,
} from './inkFile';

const stroke = (id: string, points: InkStroke['points'], tool: InkStroke['tool'] = 'pen') => ({
  id,
  tool,
  colour: '#1d2725',
  width: 2,
  points,
});

const DRAWING: Ink = {
  version: 1,
  width: 600,
  height: 200,
  recognisedText: null,
  strokes: [
    stroke('aaaa1111', [
      [10, 10, 0.5, 0],
      [20.123, 15.456, 0.6666, 8.4],
    ]),
    stroke('bbbb2222', [[50, 60, 0.4, 0]], 'highlighter'),
  ],
};

describe('ink files', () => {
  it('are written one stroke per line, rounded, and read back the same', () => {
    const text = serialiseInk(DRAWING);
    expect(text).toBe(
      [
        '{',
        '  "version": 1,',
        '  "width": 600,',
        '  "height": 200,',
        '  "recognisedText": null,',
        '  "strokes": [',
        '    {"id":"aaaa1111","tool":"pen","colour":"#1d2725","width":2,"points":[[10,10,0.5,0],[20.12,15.46,0.667,8]]},',
        '    {"id":"bbbb2222","tool":"highlighter","colour":"#1d2725","width":2,"points":[[50,60,0.4,0]]}',
        '  ]',
        '}',
        '',
      ].join('\n'),
    );
    const { ink, error } = parseInk(text);
    expect(error).toBeNull();
    expect(serialiseInk(ink)).toBe(text);
  });

  it('write an empty drawing on one line', () => {
    expect(serialiseInk(emptyInk(300, 100))).toContain('"strokes": []');
  });

  it('read what they can, and leave out strokes they cannot', () => {
    const { ink, error } = parseInk(
      JSON.stringify({
        version: 1,
        strokes: [
          { id: 'x', tool: 'crayon', colour: 'red', width: -1, points: [[1, 2]] },
          { id: 'x', points: [[3, 4, 7, 5]] },
          { id: 'y', points: [] },
          'junk',
        ],
      }),
    );
    expect(error).toBeNull();
    expect(ink.strokes).toHaveLength(2);
    expect(ink.strokes[0]).toEqual({
      id: 'x',
      tool: 'pen',
      colour: '#000000',
      width: 2,
      points: [[1, 2, 0.5, 0]],
    });
    // A repeated id gets a new one, and pressure stays in range.
    expect(ink.strokes[1]?.id).not.toBe('x');
    expect(ink.strokes[1]?.points[0]).toEqual([3, 4, 1, 5]);
  });

  it('say why a file cannot be read, so it is never written over', () => {
    expect(parseInk('{oops').error).toMatch(/not valid JSON/);
    expect(parseInk('[1]').error).toMatch(/not a drawing/);
    expect(parseInk('{"version":2}').error).toMatch(/newer/);
    expect(parseInk('').error).toBeNull();
  });

  it('merge two copies by keeping every stroke from both', () => {
    const theirs: Ink = {
      ...DRAWING,
      height: 400,
      strokes: [DRAWING.strokes[1] as InkStroke, stroke('cccc3333', [[1, 1, 0.5, 0]])],
    };
    const merged = mergeInk({ ...DRAWING, strokes: [DRAWING.strokes[0] as InkStroke] }, theirs);
    expect(merged.strokes.map((s) => s.id)).toEqual(['aaaa1111', 'bbbb2222', 'cccc3333']);
    expect(merged.height).toBe(400);
  });

  it('know the area their strokes cover', () => {
    expect(inkBounds([])).toBeNull();
    expect(inkBounds([stroke('a', [[10, 20, 0.5, 0]])])).toEqual({ x: 5, y: 15, w: 10, h: 10 });
  });
});
