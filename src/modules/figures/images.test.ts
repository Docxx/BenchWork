import { showsFor } from './images';
import { fillWith, newGrid, type Grid } from './model';
import type { Planes } from './tiff';

const planes = (peaks: number[]): Planes => ({
  width: 2,
  height: 2,
  bits: 16,
  channels: peaks.map(() => new Uint16Array(4)),
  rgb: false,
  umPerPx: 0.325,
  peaks,
});

describe('showing images alike', () => {
  const figure = fillWith(newGrid(2, 1), ['bright.tif', 'dim.tif']);
  const all = new Map([
    ['bright.tif', planes([4000, 3000])],
    ['dim.tif', planes([1000, 500])],
  ]);
  const [top, bottom] = figure.panels;

  it('starts every panel from zero to the brightest value in the figure', () => {
    if (!top || !bottom) throw new Error('No panels');
    const a = showsFor(figure, top, all.get('bright.tif') ?? planes([]), all);
    const b = showsFor(figure, bottom, all.get('dim.tif') ?? planes([]), all);
    expect(a.map((s) => s.max)).toEqual([4000, 3000]);
    expect(b).toEqual(a);
    expect(a.map((s) => s.colour)).toEqual(['#3ddc5a', '#ff40ff']);
  });

  it('uses each group’s own settings: the figure, or one per row', () => {
    if (!top || !bottom) throw new Error('No panels');
    const set = { min: 10, max: 2000, colour: '#ffffff', on: true };
    const byRow: Grid = {
      ...figure,
      display: { scope: 'row', groups: { r0: [set, set] } },
    };
    expect(showsFor(byRow, top, planes([4000, 3000]), all)[0]?.max).toBe(2000);
    // The second row has none of its own yet.
    expect(showsFor(byRow, bottom, planes([1000, 500]), all)[0]?.max).toBe(4000);
    const whole: Grid = { ...figure, display: { scope: 'figure', groups: { all: [set, set] } } };
    expect(showsFor(whole, bottom, planes([1000, 500]), all)[0]).toEqual(set);
  });
});
