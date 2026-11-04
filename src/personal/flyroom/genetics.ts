/**
 * Fly genetics for the cross planner: genotypes written chromosome by
 * chromosome (X ; 2 ; 3 ; 4), and the progeny two flies give, with their
 * ratios, which die, and the markers to sort them by.
 *
 * A genotype is written as `w ; Sco/CyO ; TM3/TM6 ; +`. A slash separates
 * the two copies of a chromosome; one entry means both copies are the same
 * (or, for a male's X, his only X). Alleles on the same copy are separated
 * by spaces or commas. Recombination is not modelled.
 */

export const CHROMOSOMES = ['X', '2', '3', '4'] as const;

/** One chromosome's two copies. For a male's X, the second is `Y`. */
export type Pair = readonly [string, string];

/** X, 2, 3 and 4, each as two copies. */
export type Genotype = readonly [Pair, Pair, Pair, Pair];

export type Sex = 'female' | 'male';

/** A balancer, or a dominant marker, and what it looks like. */
export interface Marker {
  /** The name as written, matched at the start of an allele: `TM6B` matches `TM6B,Tb`. */
  name: string;
  /** What to look for, such as `Curly wings`. */
  shows: string;
  /** Short form for the progeny list, such as `Cy`. */
  short: string;
  balancer: boolean;
  /** Two copies kill the fly. */
  lethal: boolean;
}

/**
 * Common balancers and dominant markers. Each can be changed or added to in
 * the Fly room settings; these are only the starting list.
 */
export const DEFAULT_MARKERS: readonly Marker[] = [
  { name: 'FM7', shows: 'Bar eyes', short: 'B', balancer: true, lethal: false },
  { name: 'FM6', shows: 'Bar eyes', short: 'B', balancer: true, lethal: false },
  { name: 'CyO', shows: 'Curly wings', short: 'Cy', balancer: true, lethal: true },
  { name: 'SM6', shows: 'Curly wings', short: 'Cy', balancer: true, lethal: true },
  { name: 'SM5', shows: 'Curly wings', short: 'Cy', balancer: true, lethal: true },
  { name: 'TM3', shows: 'Stubble bristles', short: 'Sb', balancer: true, lethal: true },
  { name: 'TM6B', shows: 'Humeral, Tubby', short: 'Hu Tb', balancer: true, lethal: true },
  { name: 'TM6C', shows: 'Stubble, Tubby', short: 'Sb Tb', balancer: true, lethal: true },
  { name: 'TM6', shows: 'Humeral', short: 'Hu', balancer: true, lethal: true },
  { name: 'TM2', shows: 'Ultrabithorax halteres', short: 'Ubx', balancer: true, lethal: true },
  { name: 'MKRS', shows: 'Stubble bristles', short: 'Sb', balancer: true, lethal: true },
  { name: 'Sco', shows: 'Scutoid bristles', short: 'Sco', balancer: false, lethal: true },
  { name: 'Pin', shows: 'Pin bristles', short: 'Pin', balancer: false, lethal: true },
  { name: 'Sp', shows: 'Sternopleural bristles', short: 'Sp', balancer: false, lethal: false },
  { name: 'Gla', shows: 'Glazed eyes', short: 'Gla', balancer: false, lethal: true },
  { name: 'Sb', shows: 'Stubble bristles', short: 'Sb', balancer: false, lethal: true },
  { name: 'Ser', shows: 'Serrate wings', short: 'Ser', balancer: false, lethal: true },
  { name: 'Dr', shows: 'Drop eyes', short: 'Dr', balancer: false, lethal: true },
];

/** Where the copies of a chromosome are split: a slash not inside brackets. */
function splitTop(text: string, by: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '{' || ch === '[' || ch === '(') depth += 1;
    if (ch === '}' || ch === ']' || ch === ')') depth = Math.max(0, depth - 1);
    if (ch === by && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

/** A copy written tidily: single spaces, `+` when empty, commas kept as written. */
function tidy(copy: string): string {
  const text = copy
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
  return text === '' ? '+' : text;
}

/**
 * Reads a genotype. Missing chromosomes are wild type, so `w ; CyO/Sp`
 * means `w ; CyO/Sp ; + ; +`. Never throws.
 */
export function parseGenotype(text: string): Genotype {
  const parts = splitTop(text, ';');
  const pairs = CHROMOSOMES.map((_c, i): Pair => {
    const copies = splitTop(parts[i] ?? '', '/').map(tidy);
    const first = copies[0] ?? '+';
    return [first, copies[1] ?? first];
  });
  return [
    pairs[0] ?? ['+', '+'],
    pairs[1] ?? ['+', '+'],
    pairs[2] ?? ['+', '+'],
    pairs[3] ?? ['+', '+'],
  ];
}

/** Writes a pair: `CyO` for two the same, `Sco/CyO` otherwise. */
export function formatPair(pair: Pair): string {
  return pair[0] === pair[1] ? pair[0] : `${pair[0]}/${pair[1]}`;
}

/** Writes a genotype as `w ; Sco/CyO ; TM3/TM6 ; +`. */
export function formatGenotype(genotype: Genotype): string {
  return genotype.map(formatPair).join(' ; ');
}

/** The alleles on one copy: `elav-Gal4, UAS-GFP` as two. */
export function alleles(copy: string): string[] {
  return copy
    .split(/[\s,]+/)
    .map((a) => a.trim())
    .filter((a) => a !== '' && a !== '+');
}

/** The marker an allele is, if any: the longest name it starts with. */
export function markerOf(allele: string, markers: readonly Marker[]): Marker | null {
  let best: Marker | null = null;
  for (const m of markers) {
    if (allele.startsWith(m.name) && (best === null || m.name.length > best.name.length)) {
      best = m;
    }
  }
  return best;
}

export interface CrossOptions {
  markers?: readonly Marker[];
  /** Alleles known to kill the fly in two copies, besides lethal markers and `l(…)` alleles. */
  lethal?: readonly string[];
}

/** A kind of fly the cross gives. */
export interface Progeny {
  sex: Sex;
  genotype: Genotype;
  /** Its share of all the surviving flies, from 0 to 1. */
  share: number;
  /** Markers it shows, such as `Cy` and `Sb`. */
  markers: string[];
  /** It carries a balancer. */
  balanced: boolean;
}

export interface CrossResult {
  /** Surviving kinds, most common first, females before males. */
  progeny: Progeny[];
  /** Kinds that die, with why, and the share of fertilised eggs they were. */
  dead: { sex: Sex; genotype: Genotype; share: number; why: string }[];
  /** Things to know about this cross, such as possible recombination. */
  notes: string[];
}

function isLethalAllele(
  allele: string,
  options: CrossOptions,
  markers: readonly Marker[],
): boolean {
  if (/^l\(/.test(allele)) return true;
  if (options.lethal?.some((l) => l.trim() !== '' && allele === l.trim())) return true;
  return markerOf(allele, markers)?.lethal === true;
}

/** Why a fly dies, or null if it lives. */
function deathOf(
  genotype: Genotype,
  sex: Sex,
  options: CrossOptions,
  markers: readonly Marker[],
): string | null {
  for (let i = 0; i < 4; i += 1) {
    const pair = genotype[i];
    if (!pair) continue;
    const [a, b] = pair;
    const name = CHROMOSOMES[i] ?? '';
    if (i === 0 && sex === 'male') {
      const lethal = alleles(a).find((x) => /^l\(/.test(x) || options.lethal?.includes(x));
      if (lethal) return `${lethal} with no other X`;
      continue;
    }
    const inB = new Set(alleles(b));
    for (const allele of alleles(a)) {
      if (inB.has(allele) && isLethalAllele(allele, options, markers)) {
        return `two copies of ${allele} on ${name === 'X' ? 'the X' : `chromosome ${name}`}`;
      }
    }
  }
  return null;
}

function markersOf(
  genotype: Genotype,
  markers: readonly Marker[],
): { shows: string[]; balanced: boolean } {
  const shows = new Set<string>();
  let balanced = false;
  for (const pair of genotype) {
    for (const copy of pair) {
      for (const allele of alleles(copy)) {
        const m = markerOf(allele, markers);
        if (!m) continue;
        balanced ||= m.balancer;
        for (const s of m.short.split(' ')) shows.add(s);
      }
    }
  }
  return { shows: [...shows], balanced };
}

/**
 * The two copies in a fixed order, so `+/CyO` and `CyO/+` are one kind:
 * alleles of interest first, then balancers, then wild type, as usually written.
 */
function ordered(a: string, b: string, markers: readonly Marker[]): Pair {
  const rank = (c: string) =>
    c === '+' ? 2 : alleles(c).some((x) => markerOf(x, markers)?.balancer) ? 1 : 0;
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra < rb ? [a, b] : [b, a];
  return a.localeCompare(b) <= 0 ? [a, b] : [b, a];
}

/**
 * The progeny of a cross: each parent gives one copy of each chromosome at
 * random; daughters get their father's X and sons his Y. Kinds that cannot
 * live are left out and the rest share 100%.
 */
export function cross(mother: Genotype, father: Genotype, options: CrossOptions = {}): CrossResult {
  const markers = options.markers ?? DEFAULT_MARKERS;
  const notes: string[] = [];
  // The father's X: his first copy, as a male has one.
  const fatherX = father[0][0];
  if (father[0][1] !== fatherX && father[0][1] !== 'Y' && father[0][1] !== '+') {
    notes.push(`A male has one X; ${fatherX} is used, not ${father[0][1]}.`);
  }

  let kinds: { sex: Sex; pairs: Pair[]; share: number }[] = [
    ...[mother[0][0], mother[0][1]].map((x) => ({
      sex: 'female' as const,
      pairs: [ordered(x, fatherX, markers)],
      share: 0.25,
    })),
    ...[mother[0][0], mother[0][1]].map((x) => ({
      sex: 'male' as const,
      pairs: [[x, 'Y'] as Pair],
      share: 0.25,
    })),
  ];
  for (let i = 1; i < 4; i += 1) {
    const m = mother[i] ?? ['+', '+'];
    const f = father[i] ?? ['+', '+'];
    const next: typeof kinds = [];
    for (const k of kinds) {
      for (const a of m) {
        for (const b of f)
          next.push({
            sex: k.sex,
            pairs: [...k.pairs, ordered(a, b, markers)],
            share: k.share / 4,
          });
      }
    }
    kinds = next;
  }

  // Alike kinds together.
  const merged = new Map<string, { sex: Sex; genotype: Genotype; share: number }>();
  for (const k of kinds) {
    const genotype = k.pairs as unknown as Genotype;
    const key = `${k.sex}|${formatGenotype(genotype)}`;
    const found = merged.get(key);
    if (found) found.share += k.share;
    else merged.set(key, { sex: k.sex, genotype, share: k.share });
  }

  const living: Progeny[] = [];
  const dead: CrossResult['dead'] = [];
  for (const k of merged.values()) {
    const why = deathOf(k.genotype, k.sex, options, markers);
    if (why !== null) {
      dead.push({ ...k, why });
      continue;
    }
    const { shows, balanced } = markersOf(k.genotype, markers);
    living.push({ ...k, markers: shows, balanced });
  }
  const alive = living.reduce((sum, p) => sum + p.share, 0);
  for (const p of living) p.share = alive > 0 ? p.share / alive : 0;
  living.sort((a, b) =>
    a.sex === b.sex
      ? b.share - a.share || formatGenotype(a.genotype).localeCompare(formatGenotype(b.genotype))
      : a.sex === 'female'
        ? -1
        : 1,
  );

  // The mother's chromosomes can swap pieces when neither copy is a balancer.
  for (let i = 0; i < 4; i += 1) {
    if (i === 3) continue; // The 4th does not recombine.
    const [a, b] = mother[i] ?? ['+', '+'];
    const both = alleles(a).length > 0 && alleles(b).length > 0;
    const balancer = [a, b].some((c) => alleles(c).some((x) => markerOf(x, markers)?.balancer));
    if (a !== b && both && !balancer) {
      const name = CHROMOSOMES[i] === 'X' ? 'the X' : `chromosome ${CHROMOSOMES[i] ?? ''}`;
      notes.push(`The mother's two copies of ${name} can recombine; some progeny may carry a mix.`);
    }
  }
  return { progeny: living, dead, notes };
}

/** A share as a percentage for the list, such as `12.5%`. */
export function percent(share: number): string {
  const p = Math.round(share * 1000) / 10;
  return `${String(p)}%`;
}
