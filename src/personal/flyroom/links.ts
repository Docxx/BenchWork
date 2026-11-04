import { alleles, CHROMOSOMES, markerOf, type Genotype, type Marker } from './genetics';

/**
 * Links out from a stock: FlyBase pages and searches, and the stock centre.
 * FlyBase names Bloomington stocks FBst plus the stock number in seven
 * digits, so Bloomington 93769 is FBst0093769.
 */

const FLYBASE = 'https://flybase.org';

/** A FlyBase ID such as FBst0093769, FBal0123456 or FBti0012345. */
const FLYBASE_ID = /^FB[a-z]{2}\d{7}$/;

export function isFlybaseId(id: string): boolean {
  return FLYBASE_ID.test(id.trim());
}

/** The FlyBase page of an ID, or null if it is not one. */
export function flybaseReport(id: string): string | null {
  const v = id.trim();
  return FLYBASE_ID.test(v) ? `${FLYBASE}/reports/${v}` : null;
}

/** A FlyBase search for an allele, transgene or gene. */
export function flybaseSearch(term: string): string {
  return `${FLYBASE}/search/${encodeURIComponent(term.trim())}`;
}

/** The FlyBase page of a stock centre stock, where it is known; Bloomington only. */
export function stockCentreLink(source: string, number: string): string | null {
  const n = number.trim().replace(/^#/, '');
  if (!/^\d{1,7}$/.test(n)) return null;
  if (!/bloomington|bdsc/i.test(source)) return null;
  return `${FLYBASE}/reports/FBst${n.padStart(7, '0')}`;
}

/** What a stock carries, chromosome by chromosome. */
export interface Carries {
  chromosome: string;
  /** Alleles and transgenes, not balancers or wild type. */
  alleles: string[];
  /** Balancers on this chromosome. */
  balancers: string[];
}

export interface Description {
  carries: Carries[];
  /** Markers the flies show, such as Cy and Sb. */
  markers: string[];
}

/** A genotype described: what is on each chromosome, and the markers to see. */
export function describe(genotype: Genotype, markers: readonly Marker[]): Description {
  const shown = new Set<string>();
  const carries = genotype.map((pair, i): Carries => {
    const found = new Set<string>();
    const balancers = new Set<string>();
    for (const copy of pair) {
      for (const allele of alleles(copy)) {
        if (allele === 'Y') continue;
        const m = markerOf(allele, markers);
        if (m) for (const s of m.short.split(' ')) shown.add(s);
        if (m?.balancer) balancers.add(allele);
        else found.add(allele);
      }
    }
    return {
      chromosome: CHROMOSOMES[i] ?? '',
      alleles: [...found],
      balancers: [...balancers],
    };
  });
  return { carries, markers: [...shown] };
}

/** Tags written with commas or semicolons, tidied and without repeats. */
export function parseTags(text: string): string[] {
  const seen = new Map<string, string>();
  for (const t of text.split(/[;,]/)) {
    const tag = t.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (tag !== '' && !seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
  }
  return [...seen.values()];
}
