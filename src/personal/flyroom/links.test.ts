import { DEFAULT_MARKERS, parseGenotype } from './genetics';
import {
  describe as describeGenotype,
  flybaseReport,
  flybaseSearch,
  parseTags,
  referenceLink,
  stockCentreLink,
  stockCentrePage,
} from './links';
import { DEFAULT_LOOK } from './look';
import { readStock } from './records';
import { parseSettings } from './store';

describe('links out', () => {
  it('sends each stock centre to its own lookup, apart from FlyBase', () => {
    expect(stockCentrePage('Bloomington', '36559')).toEqual({
      centre: 'Bloomington',
      url: 'https://bdsc.indiana.edu/Home/Search?presearch=36559',
    });
    expect(stockCentrePage('VDRC Vienna', 'v100158')?.url).toBe(
      'https://shop.vbc.ac.at/vdrc_store/catalogsearch/result/?q=100158',
    );
    expect(stockCentrePage('Kyoto DGRC', '109600')?.url).toBe(
      'https://kyotofly.kit.jp/cgi-bin/stocks/search_res_det.cgi?DB_NUM=1&DG_NUM=109600',
    );
    // A lab's own line, or no number, has no centre to send you to.
    expect(stockCentrePage('Monnier lab', '12')).toBeNull();
    expect(stockCentrePage('Bloomington', '')).toBeNull();
  });

  it('links a reference by its DOI, or by an address if there is one', () => {
    expect(referenceLink('Smith et al. 2024, doi:10.1038/s41586-024-00001-2')).toBe(
      'https://doi.org/10.1038/s41586-024-00001-2',
    );
    // A full stop ending the sentence is not part of the DOI.
    expect(referenceLink('See 10.1534/genetics.119.302205.')).toBe(
      'https://doi.org/10.1534/genetics.119.302205',
    );
    expect(referenceLink('https://flybase.org/reports/FBst0036559')).toBe(
      'https://flybase.org/reports/FBst0036559',
    );
    expect(referenceLink('Hanai, unpublished')).toBeNull();
  });

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
