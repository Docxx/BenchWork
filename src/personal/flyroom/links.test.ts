import { DEFAULT_MARKERS, parseGenotype } from './genetics';
import {
  describe as describeGenotype,
  flybaseReport,
  flybaseSearch,
  parseTags,
  stockCentreLink,
} from './links';
import { DEFAULT_LOOK } from './look';
import { readStock } from './records';
import { parseSettings } from './store';

describe('links out', () => {
  it('links FlyBase IDs to their page, and nothing else', () => {
    expect(flybaseReport('FBst0093769')).toBe('https://flybase.org/reports/FBst0093769');
    expect(flybaseReport(' FBal0123456 ')).toBe('https://flybase.org/reports/FBal0123456');
    expect(flybaseReport('93769')).toBeNull();
    expect(flybaseReport('FBst93769')).toBeNull();
  });

  it('searches FlyBase for an allele, safely written into the address', () => {
    expect(flybaseSearch('Myd88[KO]')).toBe('https://flybase.org/search/Myd88%5BKO%5D');
    expect(flybaseSearch('P{Switch2}GSG3473')).toBe(
      'https://flybase.org/search/P%7BSwitch2%7DGSG3473',
    );
  });

  it('finds Bloomington stocks on FlyBase by their number', () => {
    expect(stockCentreLink('Bloomington', '93769')).toBe('https://flybase.org/reports/FBst0093769');
    expect(stockCentreLink('BDSC', '#5905')).toBe('https://flybase.org/reports/FBst0005905');
    expect(stockCentreLink('Amber', '12')).toBeNull();
    expect(stockCentreLink('Bloomington', 'N/A')).toBeNull();
  });
});

describe('what a stock carries', () => {
  it('lists alleles and balancers by chromosome, and the markers to see', () => {
    const d = describeGenotype(parseGenotype('y w ; Pin/CyO ; UAS-cd8::GFP ; +'), DEFAULT_MARKERS);
    expect(d.carries.map((c) => [c.chromosome, c.alleles, c.balancers])).toEqual([
      ['X', ['y', 'w'], []],
      ['2', ['Pin'], ['CyO']],
      ['3', ['UAS-cd8::GFP'], []],
      ['4', [], []],
    ]);
    expect(d.markers).toEqual(['Pin', 'Cy']);
  });
});

describe('how genotypes look', () => {
  it('keeps the chosen look, and falls back for odd values', () => {
    expect(parseSettings({ look: { genotypes: 'line', colour: true } }).look).toEqual({
      genotypes: 'line',
      colour: true,
    });
    expect(parseSettings({ look: { genotypes: 'sideways' } }).look).toEqual(DEFAULT_LOOK);
    expect(parseSettings(null).look).toEqual(DEFAULT_LOOK);
  });
});

describe('tags', () => {
  it('reads tags with commas or semicolons, without repeats', () => {
    expect(parseTags('Immunity, BBB; immunity ,  GeneSwitch ')).toEqual([
      'Immunity',
      'BBB',
      'GeneSwitch',
    ]);
    expect(readStock('a.flystock.yaml', { tags: ['BBB', 'Immunity'] }).tags).toEqual([
      'BBB',
      'Immunity',
    ]);
  });
});
