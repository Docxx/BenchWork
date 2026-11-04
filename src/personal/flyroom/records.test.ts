import {
  isoDate,
  linkName,
  mapColumns,
  mendRow,
  parseCsv,
  readCross,
  readStock,
  stocksFromCsv,
} from './records';
import { dueSteps, nearestTemperature, steps } from './schedule';

describe('records', () => {
  it('reads a stock, tolerating odd values', () => {
    const s = readStock('Fly room/Stocks/w1118.flystock.yaml', {
      genotype: 'w[1118]',
      status: 'quarantine',
      established: new Date('2026-08-04T00:00:00Z'),
      lethal: 'ko; l(2)x',
      flipEvery: '14',
    });
    expect(s).toMatchObject({
      name: 'w1118',
      status: 'Quarantine',
      established: '2026-08-04',
      lethal: ['ko', 'l(2)x'],
      flipEvery: 14,
    });
    expect(readStock('a.flystock.yaml', { status: 'odd', flipEvery: 'x' })).toMatchObject({
      status: 'Healthy',
      flipEvery: null,
    });
  });

  it('reads a cross, at 25 °C unless set', () => {
    const c = readCross('Fly room/Crosses/Climbing F1.flycross.yaml', {
      mother: '[[Sco/CyO]]',
      done: ['flip'],
    });
    expect(c).toMatchObject({
      name: 'Climbing F1',
      temperature: 25,
      status: 'Planned',
      done: ['flip'],
    });
    expect(linkName(c.mother)).toBe('Sco/CyO');
  });
});

describe('importing stocks from a CSV', () => {
  it('reads quoted fields with commas and doubled quotes', () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
  });

  it('matches headings loosely', () => {
    expect(mapColumns(['Genotype', 'Source', 'Source Serial', 'Date Added', 'Status'])).toEqual([
      'genotype',
      'source',
      'number',
      'established',
      'status',
    ]);
  });

  it('makes stocks from rows, joining chromosome columns', () => {
    const csv = [
      'Name,X,Chromosome 2,Chromosome 3,Chromosome 4,Source,Serial,Date Added,Status,Notes',
      'Myd88[KO]/CyO,w,Myd88[KO] / CyO,+,+,Bloomington,12345,31/07/2026,Quarantine,KO line',
      ',,,,,Unknown,N/A,,,',
    ].join('\n');
    expect(stocksFromCsv(csv)).toEqual([
      {
        name: 'Myd88-KO-CyO',
        data: {
          genotype: 'w ; Myd88[KO] / CyO ; + ; +',
          source: 'Bloomington',
          number: '12345',
          notes: 'KO line',
          status: 'Quarantine',
          established: '2026-07-31',
        },
      },
    ]);
  });

  it('prefers chromosome columns to a short genotype column, which becomes the name', () => {
    const csv = 'Genotype,X,Chromosome 2\nMyd88/CyO,w,Myd88 / CyO\n';
    expect(stocksFromCsv(csv)).toEqual([
      { name: 'Myd88-CyO', data: { genotype: 'w ; Myd88 / CyO ; + ; +' } },
    ]);
    expect(stocksFromCsv('Genotype\nw ; CyO/Sp\n')[0]?.data['genotype']).toBe('w ; CyO/Sp');
  });

  it('reads balancer columns as second copies, and mends unquoted commas', () => {
    const csv = [
      'Name,Source,Bloomington #,Chr X/Y,Chr X/Y Balancer,Chr 2,Chr 2 Balancer,Chr 3,Chr 3 Balancer,Chr 4,Chr 4 Balancer,Status,Notes,Date Added',
      'Sco/CyO; TM3/TM6,,,+,,Sco,CyO,TM3,TM6,+,,Healthy,Double balancer,03/08/2026',
      'mdr65-Gal4, UAS-GFP,,,+,,+,,mdr65-Gal4, UAS-GFP,,+,,Healthy,Both on 3,04/08/2026',
      'Rel[E20] e[s],Bloomington,9457,w,,+,,Rel e,,+,,Dead,Gone,20/04/2026',
    ].join('\n');
    const found = stocksFromCsv(csv);
    expect(found.map((s) => [s.name, s.data['genotype'], s.data['status']])).toEqual([
      ['Sco-CyO; TM3-TM6', '+ ; Sco/CyO ; TM3/TM6 ; +', 'Healthy'],
      ['mdr65-Gal4, UAS-GFP', '+ ; + ; mdr65-Gal4, UAS-GFP ; +', 'Healthy'],
      ['Rel-E20 e-s', 'w ; + ; Rel e ; +', 'Dead'],
    ]);
    expect(found[2]?.data).toMatchObject({ source: 'Bloomington', number: '9457' });
    expect(mendRow(['a', ' b', 'c', ' d'], 3)).toEqual(['a, b', 'c', ' d']);
  });

  it('reads dates day first', () => {
    expect(isoDate('04/08/2026')).toBe('2026-08-04');
    expect(isoDate('2026-8-4')).toBe('2026-08-04');
    expect(isoDate('soon')).toBe('');
  });
});

describe('cross timetable', () => {
  it('dates each step from the set-up day and temperature', () => {
    const s = steps('2026-11-03', 25);
    expect(s.map((x) => [x.id, x.date])).toEqual([
      ['flip', '2026-11-06'],
      ['hatch', '2026-11-13'],
      ['collect', '2026-11-13'],
      ['last', '2026-11-21'],
    ]);
    expect(steps('2026-11-03', 18).find((x) => x.id === 'hatch')?.date).toBe('2026-11-22');
    expect(steps('not a date', 25)).toEqual([]);
    expect(nearestTemperature(22)).toBe(25);
  });

  it('lists steps due and not ticked off', () => {
    const s = steps('2026-11-03', 25);
    expect(dueSteps(s, [], '2026-11-06').map((x) => x.id)).toEqual(['flip']);
    expect(dueSteps(s, ['flip'], '2026-11-14').map((x) => x.id)).toEqual(['hatch', 'collect']);
  });
});
