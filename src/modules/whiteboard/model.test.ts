// @vitest-environment node
import {
  boundsOf,
  boundsOfAll,
  duplicated,
  hits,
  itemAt,
  lassoed,
  moved,
  parseBoard,
  resized,
  serialiseBoard,
  tidied,
  withJoinsFollowed,
  wrapText,
  type BoardItem,
  type BoardPoint,
  type ShapeItem,
  type StrokeItem,
} from './model';

const stroke = (id: string, points: [number, number][]): StrokeItem => ({
  id,
  kind: 'stroke',
  pen: 'pen',
  colour: '#1d2725',
  width: 2,
  points: points.map(([x, y]): BoardPoint => [x, y, 0.5]),
});
const box = (id: string, x: number, y: number, w = 100, h = 60): ShapeItem => ({
  id,
  kind: 'shape',
  shape: 'rect',
  x1: x,
  y1: y,
  x2: x + w,
  y2: y + h,
  colour: '#1d2725',
  width: 2,
  fill: null,
});

describe('reading and writing a board', () => {
  it('keeps what it knows, leaves out odd items, and survives a round trip', () => {
    const board = parseBoard(
      JSON.stringify({
        version: 1,
        items: [
          {
            id: 's',
            kind: 'stroke',
            pen: 'marker',
            colour: '#ff0000',
            width: 6,
            points: [
              [1, 2, 0.7],
              [3.14159, 4],
            ],
          },
          { id: 't', kind: 'text', x: 0, y: 0, text: 'Hello' },
          { kind: 'note', x: 5, y: 5, text: 'Buy fly food', colour: 'not a colour' },
          { kind: 'image', x: 0, y: 0, path: 'Lab/_attachments/gel.png' },
          { kind: 'stroke', points: 'no' },
          { kind: 'wormhole' },
        ],
      }),
    );
    expect(board?.items.map((i) => i.kind)).toEqual(['stroke', 'text', 'note', 'image']);
    expect(board?.items[0]).toMatchObject({
      pen: 'marker',
      points: [
        [1, 2, 0.7],
        [3.14159, 4, 0.5],
      ],
    });
    expect(board?.items[2]).toMatchObject({ colour: '#ffe58a', w: 180 });
    const again = parseBoard(serialiseBoard(board ?? { version: 1, items: [] }));
    expect(again?.items[0]).toMatchObject({
      points: [
        [1, 2, 0.7],
        [3.14, 4, 0.5],
      ],
    });
    expect(parseBoard('not json')).toBeNull();
    expect(parseBoard('{"cards": []}')).toBeNull();
  });
});

describe('measuring and touching items', () => {
  it('measures strokes with their width, and text by its wrapped lines', () => {
    expect(
      boundsOf(
        stroke('a', [
          [10, 10],
          [50, 30],
        ]),
      ),
    ).toEqual({ x: 9, y: 9, w: 42, h: 22 });
    expect(wrapText('one two three four', 40, 10)).toEqual(['one two', 'three', 'four']);
    const text: BoardItem = {
      id: 't',
      kind: 'text',
      x: 0,
      y: 0,
      w: 40,
      text: 'one two three four',
      colour: '#000000',
      size: 10,
    };
    expect(boundsOf(text).h).toBe(39);
    expect(boundsOfAll([box('a', 0, 0), box('b', 200, 100)])).toEqual({
      x: 0,
      y: 0,
      w: 300,
      h: 160,
    });
  });

  it('touches a stroke along its line, an empty box on its edge, a filled one anywhere', () => {
    const s = stroke('a', [
      [0, 0],
      [100, 0],
    ]);
    expect(hits(s, 50, 2, 2)).toBe(true);
    expect(hits(s, 50, 20, 2)).toBe(false);
    expect(hits(box('b', 0, 0), 50, 30, 3)).toBe(false);
    expect(hits(box('b', 0, 0), 1, 30, 3)).toBe(true);
    expect(hits({ ...box('b', 0, 0), fill: '#ffffff' }, 50, 30, 3)).toBe(true);
    // The one in front wins.
    const items = [
      { ...box('back', 0, 0), fill: '#ffffff' },
      { ...box('front', 0, 0), fill: '#ffffff' },
    ];
    expect(itemAt(items, 50, 30, 2)?.id).toBe('front');
  });

  it('takes in what a lasso goes round', () => {
    const items = [box('in', 10, 10, 20, 20), box('out', 300, 300, 20, 20)];
    expect(
      lassoed(items, [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ]),
    ).toEqual(['in']);
  });
});

describe('moving, resizing and copying', () => {
  it('moves and stretches items', () => {
    expect(
      moved(
        stroke('a', [
          [0, 0],
          [10, 10],
        ]),
        5,
        -5,
      ),
    ).toMatchObject({
      points: [
        [5, -5, 0.5],
        [15, 5, 0.5],
      ],
    });
    const twice = resized(
      box('b', 10, 10, 100, 60),
      { x: 10, y: 10, w: 100, h: 60 },
      { x: 0, y: 0, w: 200, h: 120 },
    );
    expect(twice).toMatchObject({ x1: 0, y1: 0, x2: 200, y2: 120 });
  });

  it('copies with new ids, keeping arrows joined to the copies', () => {
    const arrow: ShapeItem = { ...box('arrow', 0, 0), shape: 'arrow', from: 'a', to: 'b' };
    const copies = duplicated([box('a', 0, 0), box('b', 300, 0), arrow], 20, 20);
    const [a, b, joined] = copies;
    expect(a?.id).not.toBe('a');
    expect(joined).toMatchObject({ from: a?.id, to: b?.id });
  });

  it('keeps joined arrows on the edges of what they join, as it moves', () => {
    const arrow: ShapeItem = { ...box('arrow', 0, 0), shape: 'arrow', from: 'a', to: 'b' };
    const [, , followed] = withJoinsFollowed([
      box('a', 0, 0, 100, 100),
      box('b', 300, 0, 100, 100),
      arrow,
    ]);
    expect(followed).toMatchObject({ x1: 100, y1: 50, x2: 300, y2: 50 });
    // With one end's item gone, that end stays put and is no longer joined.
    const [, loose] = withJoinsFollowed([box('a', 0, 0, 100, 100), { ...arrow, x2: 500, y2: 50 }]);
    expect(loose).toMatchObject({ x1: 100, y1: 50, x2: 500, y2: 50 });
    expect((loose as ShapeItem).to).toBeUndefined();
  });
});

describe('tidying rough shapes', () => {
  it('makes a closed loop a box or an ellipse, and a straight stroke a line', () => {
    const square = stroke('s', [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
      [0, 3],
    ]);
    expect(tidied(square)).toMatchObject({ shape: 'rect', x1: 0, y1: 0, x2: 100, y2: 100 });
    const circle = stroke(
      'c',
      Array.from({ length: 25 }, (_v, i): [number, number] => [
        50 + 50 * Math.cos((i / 24) * 2 * Math.PI),
        50 + 50 * Math.sin((i / 24) * 2 * Math.PI),
      ]),
    );
    expect(tidied(circle)?.shape).toBe('ellipse');
    expect(
      tidied(
        stroke('l', [
          [0, 0],
          [40, 1],
          [80, -1],
          [120, 0],
        ]),
      ),
    ).toMatchObject({ shape: 'line', x2: 120 });
    expect(
      tidied(
        stroke('w', [
          [0, 0],
          [40, 40],
          [80, 0],
          [120, 40],
        ]),
      ),
    ).toBeNull();
  });
});
