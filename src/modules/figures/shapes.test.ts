import { ends, newShape, parseShape, shapePrims } from './shapes';

const box = { x: 10, y: 20, w: 40, h: 10 };

describe('shapes', () => {
  it('runs a line across, down or corner to corner in its box', () => {
    expect(ends(newShape(), box)).toEqual([
      [10, 25],
      [50, 25],
    ]);
    expect(ends({ ...newShape(), way: 'down' }, box)).toEqual([
      [30, 20],
      [30, 30],
    ]);
    expect(ends({ ...newShape(), way: 'rise' }, box)).toEqual([
      [10, 30],
      [50, 20],
    ]);
  });

  it('gives an arrow a head at its end, or at both, pointing back when flipped', () => {
    const one = shapePrims(newShape('arrow'), box);
    expect(one.filter((p) => p.kind === 'poly')).toHaveLength(1);
    const head = one.find((p) => p.kind === 'poly');
    expect(head?.kind === 'poly' && head.points[0]).toEqual([50, 25]);
    const flipped = shapePrims({ ...newShape('arrow'), flip: true }, box).find(
      (p) => p.kind === 'poly',
    );
    expect(flipped?.kind === 'poly' && flipped.points[0]).toEqual([10, 25]);
    expect(
      shapePrims({ ...newShape('arrow'), both: true }, box).filter((p) => p.kind === 'poly'),
    ).toHaveLength(2);
  });

  it('turns a bracket’s ends down, or up when flipped', () => {
    const ticks = (flip: boolean) =>
      shapePrims({ ...newShape('bracket'), flip }, box).filter(
        (p) => p.kind === 'line' && p.from[0] === p.to[0],
      );
    const down = ticks(false);
    expect(down).toHaveLength(2);
    expect(down[0]?.kind === 'line' && down[0].to[1]).toBeGreaterThan(25);
    const up = ticks(true)[0];
    expect(up?.kind === 'line' && up.to[1]).toBeLessThan(25);
  });

  it('draws a box as an outline, dashed if asked', () => {
    expect(shapePrims({ ...newShape('box'), dashed: true }, box)).toEqual([
      { kind: 'rect', box, stroke: '#000000', width: 0.25, dash: true },
    ]);
  });

  it('reads odd values back as something sensible', () => {
    expect(parseShape({ form: 'star', width: 99, colour: 'red' })).toEqual({
      ...newShape('line'),
      width: 3,
    });
  });
});
