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

/** A stock number as the centres write it: digits, with any leading # or v dropped. */
function stockNumber(number: string): string | null {
  const n = number.trim().replace(/^[#v]/i, '');
  return /^\d{1,7}$/.test(n) ? n : null;
}

/** The FlyBase page of a stock centre stock, where it is known; Bloomington only. */
export function stockCentreLink(source: string, number: string): string | null {
  const n = stockNumber(number);
  if (n === null || !/bloomington|bdsc/i.test(source)) return null;
  return `${FLYBASE}/reports/FBst${n.padStart(7, '0')}`;
}

/** A stock centre's own page for a stock, beside its FlyBase report. */
export interface CentreLink {
  /** The centre, as it is named on screen. */
  centre: string;
  url: string;
}

/**
 * The centres' own lookups, each checked on 26 November 2026. Bloomington and
 * VDRC answer a search; Kyoto has a page for each stock.
 */
const CENTRES: { centre: string; match: RegExp; url: (n: string) => string }[] = [
  {
    centre: 'Bloomington',
    match: /bloomington|bdsc/i,
    url: (n) => `https://bdsc.indiana.edu/Home/Search?presearch=${n}`,
  },
  {
    centre: 'VDRC',
    match: /vdrc|vienna/i,
    url: (n) => `https://shop.vbc.ac.at/vdrc_store/catalogsearch/result/?q=${n}`,
  },
  {
    centre: 'Kyoto',
    match: /kyoto|dgrc|dggr/i,
    url: (n) => `https://kyotofly.kit.jp/cgi-bin/stocks/search_res_det.cgi?DB_NUM=1&DG_NUM=${n}`,
  },
];

/** The stock centre's own page for this stock, or null when the centre is not known. */
export function stockCentrePage(source: string, number: string): CentreLink | null {
  const n = stockNumber(number);
  if (n === null) return null;
  const found = CENTRES.find((c) => c.match.test(source));
  return found ? { centre: found.centre, url: found.url(n) } : null;
}

/** The DOI or address in a reference, as a link, or null when there is none. */
export function referenceLink(reference: string): string | null {
  const text = reference.trim();
  const doi = /\b(10\.\d{4,9}\/[^\s"<>]+)/.exec(text);
  if (doi?.[1] !== undefined) return `https://doi.org/${doi[1].replace(/[.,;)]+$/, '')}`;
  const url = /\bhttps?:\/\/[^\s"<>]+/.exec(text);
  return url === null ? null : url[0].replace(/[.,;)]+$/, '');
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
