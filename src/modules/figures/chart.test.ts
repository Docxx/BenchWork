import {
  barNames,
  chartLayout,
  chartPrims,
  formatData,
  logTicks,
  mean,
  newChart,
  niceTicks,
  parseChart,
  parseData,
  sd,
  spread,
  tickText,
  type Chart,
} from './chart';
import type { Prim } from './scene';

const box = { x: 0, y: 0, w: 80, h: 60 };
const texts = (prims: Prim[]) =>
  prims.flatMap((p) => (p.kind === 'text' ? [p.runs.map((r) => r.text).join('')] : []));

const grouped = (): Chart => {
  const data = parseData(
    '\tVector\tVector\tDUSP1\tDUSP1\nControl\t10\t14\t20\t18\nMSU\t40\t42\t60\t56',
  );
  if (!data) throw new Error('not read');
  return { ...newChart(), ...data };
};

describe('numbers', () => {
  it('works out the mean, SD and SEM', () => {
    const v = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(mean(v)).toBe(5);
    expect(sd(v)).toBeCloseTo(2.138, 3);
    expect(spread(v, 'sem')).toBeCloseTo(2.138 / Math.sqrt(8), 3);
    expect(spread(v, 'none')).toBe(0);
    expect(spread([3], 'sd')).toBe(0);
  });

  it('chooses round ticks, and powers of ten for a log axis', () => {
    expect(niceTicks(0, 330)).toEqual([0, 100, 200, 300, 400]);
    expect(niceTicks(0, 1.07)).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25]);
    expect(logTicks(30, 1000)).toEqual([10, 100, 1000]);
    expect(tickText(0.25)).toBe('0.25');
    expect(tickText(1200000)).toBe('1e6');
  });
});

describe('data from a spreadsheet', () => {
  it('reads groups across with values down', () => {
    const data = parseData('WT\tKO\n1\t0.5\n1.2\t\n0.9\t0.4');
    expect(data?.groups).toEqual(['WT', 'KO']);
    expect(data?.series[0]?.values).toEqual([
      [1, 1.2, 0.9],
      [0.5, 0.4],
    ]);
  });

  it('reads series across, repeated for replicates, with groups down', () => {
    const c = grouped();
    expect(c.groups).toEqual(['Control', 'MSU']);
    expect(c.series.map((s) => s.name)).toEqual(['Vector', 'DUSP1']);
    expect(c.series[1]?.values).toEqual([
      [20, 18],
      [60, 56],
    ]);
  });

  it('reads commas as well as tabs, and turns away too little', () => {
    expect(parseData('A,B\n1,2')?.series[0]?.values).toEqual([[1], [2]]);
    expect(parseData('just one line')).toBeNull();
  });

  it('writes data back in the layout it is read in, keeping colours by name', () => {
    const c = grouped();
    const again = parseData(formatData(c), c.series);
    expect(again?.groups).toEqual(c.groups);
    expect(again?.series).toEqual(c.series);
    const simple = { ...newChart() };
    expect(parseData(formatData(simple), simple.series)?.series).toEqual(simple.series);
  });
});

describe('drawing a graph', () => {
  it('draws a bar for each group and series, with each value as a dot', () => {
    const c = grouped();
    const prims = chartPrims(c, box);
    const bars = prims.filter((p) => p.kind === 'rect' && p.fill !== undefined && p.box.w > 3);
    expect(bars).toHaveLength(4);
    const dots = prims.filter((p) => p.kind === 'poly');
    // Eight values, and two key swatches are rects, not dots.
    expect(dots).toHaveLength(8);
    expect(texts(prims)).toEqual(expect.arrayContaining(['Control', 'MSU', 'Vector', 'DUSP1']));
  });

  it('starts bars from nought and keeps the plot inside its box', () => {
    const l = chartLayout(newChart(), box);
    expect(l.yTicks[0]).toBe(0);
    expect(l.plot.x).toBeGreaterThan(0);
    expect(l.plot.y + l.plot.h).toBeLessThan(box.h);
    expect(l.y(0)).toBeCloseTo(l.plot.y + l.plot.h);
  });

  it('names each bar for brackets, and stacks a wide bracket above a narrow one', () => {
    const c = {
      ...grouped(),
      brackets: [
        { id: 'w', from: 0, to: 3, text: '**' },
        { id: 'n', from: 2, to: 3, text: 'ns' },
      ],
    };
    expect(barNames(c)).toEqual(['Control, Vector', 'Control, DUSP1', 'MSU, Vector', 'MSU, DUSP1']);
    const prims = chartPrims(c, box);
    const y = (t: string) => {
      const p = prims.find((x) => x.kind === 'text' && x.runs[0]?.text === t);
      return p?.kind === 'text' ? p.y : NaN;
    };
    expect(y('**')).toBeLessThan(y('ns'));
    // Brackets need room above the plot.
    expect(chartLayout(c, box).plot.y).toBeGreaterThan(chartLayout(grouped(), box).plot.y);
  });

  it('places numbers along the bottom by value on a line graph, and slants names when asked', () => {
    const line: Chart = {
      ...newChart(),
      type: 'line',
      groups: ['0', '1', '5'],
      series: [{ id: 's', name: 'A', colour: '#000000', values: [[1], [2], [3]] }],
    };
    const l = chartLayout(line, box);
    const [a = 0, b = 0, c = 0] = l.groupX;
    expect((c - b) / (b - a)).toBeCloseTo(4);
    const slanted = chartPrims({ ...newChart(), slant: true }, box).find(
      (p) => p.kind === 'text' && p.runs[0]?.text === 'Control',
    );
    expect(slanted?.kind === 'text' && slanted.rotate).toBe(45);
  });

  it('reads a graph back, with odd values made safe', () => {
    const c = grouped();
    expect(parseChart(JSON.parse(JSON.stringify(c)))).toEqual(c);
    const odd = parseChart({
      type: 'pie',
      groups: ['a'],
      series: [],
      size: 100,
      brackets: [{ from: 9, to: 0 }],
    });
    expect(odd.type).toBe('bar');
    expect(odd.size).toBe(24);
    expect(odd.series.length).toBeGreaterThan(0);
    expect(odd.brackets[0]?.from).toBe(0);
  });
});
