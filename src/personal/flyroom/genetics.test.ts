import {
  cross,
  formatGenotype,
  markerOf,
  parseGenotype,
  percent,
  DEFAULT_MARKERS,
} from './genetics';

const g = parseGenotype;
const shown = (r: ReturnType<typeof cross>) =>
  r.progeny.map((p) => `${p.sex} ${formatGenotype(p.genotype)} ${percent(p.share)}`);

describe('genotypes', () => {
  it('reads chromosome by chromosome, filling in wild type', () => {
    expect(formatGenotype(g('w ; Sco/CyO ; TM3/TM6'))).toBe('w ; Sco/CyO ; TM3/TM6 ; +');
    expect(formatGenotype(g('+/+ ; Elav-Gal4/+ ; +/+ ; +/+'))).toBe('+ ; Elav-Gal4/+ ; + ; +');
    expect(formatGenotype(g('y w ; Pin / CyO ; UAS-cd8::GFP ; +'))).toBe(
      'y w ; Pin/CyO ; UAS-cd8::GFP ; +',
    );
  });

  it('keeps slashes and semicolons inside brackets as part of a name', () => {
    expect(g('w ; P{UAS-a/b}2 ; +')[1]).toEqual(['P{UAS-a/b}2', 'P{UAS-a/b}2']);
    expect(g('w[1118] ; l(2)k/CyO')[1]).toEqual(['l(2)k', 'CyO']);
  });

  it('knows balancers by the start of their name', () => {
    expect(markerOf('TM6B,Tb', DEFAULT_MARKERS)?.short).toBe('Hu Tb');
    expect(markerOf('TM6', DEFAULT_MARKERS)?.short).toBe('Hu');
    expect(markerOf('CyO-GFP', DEFAULT_MARKERS)?.balancer).toBe(true);
    expect(markerOf('elav-Gal4', DEFAULT_MARKERS)).toBeNull();
  });
});

describe('crosses', () => {
  it('gives daughters the father’s X and sons a Y', () => {
    const r = cross(g('w/FM7'), g('y w'));
    expect(shown(r)).toEqual([
      'female w/y w ; + ; + ; + 25%',
      'female y w/FM7 ; + ; + ; + 25%',
      'male FM7/Y ; + ; + ; + 25%',
      'male w/Y ; + ; + ; + 25%',
    ]);
  });

  it('works out a double balancer cross, with markers to sort by', () => {
    // Sco/CyO ; TM3/TM6 virgins × elav-Gal4 tub-Gal80ts males.
    const r = cross(g('+ ; Sco/CyO ; TM3/TM6'), g('+ ; + ; elav-Gal4 tub-Gal80ts'));
    expect(r.progeny).toHaveLength(8);
    expect(r.dead).toHaveLength(0);
    for (const p of r.progeny) expect(p.share).toBeCloseTo(0.125);
    // Every one carries a balancer: none of these is free of them.
    expect(r.progeny.every((p) => p.balanced)).toBe(true);
    const first = r.progeny[0];
    expect(first && formatGenotype(first.genotype)).toBe(
      '+ ; CyO/+ ; elav-Gal4 tub-Gal80ts/TM3 ; +',
    );
    expect(first?.markers).toEqual(['Cy', 'Sb']);
  });

  it('leaves out flies with two copies of a balancer or a lethal, and shares the rest', () => {
    const r = cross(g('w ; Myd88/CyO'), g('w ; Myd88/CyO'));
    // CyO/CyO dies: Myd88/Myd88 and Myd88/CyO remain, 1 : 2.
    expect(r.dead.map((d) => d.why)).toContain('two copies of CyO on chromosome 2');
    const females = r.progeny.filter((p) => p.sex === 'female');
    expect(females.map((p) => [p.genotype[1].join('/'), percent(p.share)])).toEqual([
      ['Myd88/CyO', '33.3%'],
      ['Myd88/Myd88', '16.7%'],
    ]);
    expect(females.find((p) => !p.balanced)?.markers).toEqual([]);
  });

  it('treats l(…) alleles and ones marked lethal as killing in two copies', () => {
    const r = cross(g('w ; + ; l(3)*/TM3'), g('w ; + ; l(3)*/TM3'));
    expect(r.progeny.every((p) => p.genotype[2].includes('TM3'))).toBe(true);
    const marked = cross(g('w ; ko/CyO'), g('w ; ko/CyO'), { lethal: ['ko'] });
    expect(marked.progeny.every((p) => p.balanced)).toBe(true);
  });

  it('kills sons with a lethal on their only X', () => {
    const r = cross(g('l(1)x/FM7'), g('+'));
    expect(
      r.progeny.filter((p) => p.sex === 'male').map((p) => formatGenotype(p.genotype)),
    ).toEqual(['FM7/Y ; + ; + ; +']);
  });

  it('notes when the mother’s chromosomes can recombine', () => {
    expect(cross(g('+ ; a/b'), g('+')).notes[0]).toMatch(/chromosome 2 can recombine/);
    expect(cross(g('+ ; a/CyO'), g('+')).notes).toEqual([]);
  });
});
