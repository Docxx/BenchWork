/**
 * The calculators' sums, in base units: grams, litres, molar (mol/L) and
 * seconds. Each returns null when the inputs cannot give an answer, such as
 * a zero where it would divide.
 */

const ok = (n: number): number | null => (Number.isFinite(n) && n >= 0 ? n : null);

// ---- Solutions ----

/** mass (g) = concentration (M) × volume (L) × molecular weight (g/mol). */
export function massForMolarity(molar: number, litres: number, mw: number): number | null {
  return ok(molar * litres * mw);
}

export function molarityOf(grams: number, litres: number, mw: number): number | null {
  return litres > 0 && mw > 0 ? ok(grams / (litres * mw)) : null;
}

export function volumeForMolarity(grams: number, molar: number, mw: number): number | null {
  return molar > 0 && mw > 0 ? ok(grams / (molar * mw)) : null;
}

export interface Dilution {
  c1: number | null;
  v1: number | null;
  c2: number | null;
  v2: number | null;
}

/** C1·V1 = C2·V2: fills in the one value left empty. Null if not exactly one is empty. */
export function solveDilution(d: Dilution): Required<{ [K in keyof Dilution]: number }> | null {
  const empty = (Object.keys(d) as (keyof Dilution)[]).filter((k) => d[k] === null);
  if (empty.length !== 1) return null;
  const { c1, v1, c2, v2 } = d;
  let result: { c1: number; v1: number; c2: number; v2: number } | null = null;
  if (c1 === null && v1 !== null && c2 !== null && v2 !== null && v1 > 0)
    result = { c1: (c2 * v2) / v1, v1, c2, v2 };
  if (v1 === null && c1 !== null && c2 !== null && v2 !== null && c1 > 0)
    result = { c1, v1: (c2 * v2) / c1, c2, v2 };
  if (c2 === null && c1 !== null && v1 !== null && v2 !== null && v2 > 0)
    result = { c1, v1, c2: (c1 * v1) / v2, v2 };
  if (v2 === null && c1 !== null && v1 !== null && c2 !== null && c2 > 0)
    result = { c1, v1, c2, v2: (c1 * v1) / c2 };
  if (result === null || Object.values(result).some((n) => ok(n) === null)) return null;
  return result;
}

export interface SerialStep {
  step: number;
  concentration: number;
}

/**
 * A serial dilution: each tube is the last one divided by `factor`. Each
 * tube ends with `volume`, made of `transfer` from the tube before and
 * `diluent`; the last tube keeps its transfer volume too.
 */
export function serialDilution(
  start: number,
  factor: number,
  steps: number,
  volume: number,
): { tubes: SerialStep[]; transfer: number; diluent: number } | null {
  if (!(factor > 1) || !(volume > 0) || !(start > 0)) return null;
  const count = Math.min(Math.max(Math.round(steps), 1), 24);
  const transfer = volume / factor;
  const tubes = Array.from({ length: count }, (_, i) => ({
    step: i + 1,
    concentration: start / factor ** (i + 1),
  }));
  return { tubes, transfer, diluent: volume - transfer };
}

/** % w/v: grams of solute in `litres` for `percent` g per 100 mL. */
export function percentWeightVolume(percent: number, litres: number): number | null {
  return ok((percent / 100) * litres * 1000);
}

/** % v/v: litres of solute in `litres` of solution. */
export function percentVolumeVolume(percent: number, litres: number): number | null {
  return ok((percent / 100) * litres);
}

// ---- Molecular biology ----

/** µg/mL for an A260 of 1 with a 1 cm path. */
export const A260_FACTORS = {
  dsDNA: 50,
  ssDNA: 33,
  RNA: 40,
} as const;
export type NucleicAcid = keyof typeof A260_FACTORS;

/** Nucleic acid concentration in µg/mL (the same as ng/µL). */
export function nucleicAcidConc(a260: number, kind: NucleicAcid, dilution = 1): number | null {
  return dilution > 0 ? ok(a260 * A260_FACTORS[kind] * dilution) : null;
}

/** Protein concentration in mg/mL from A280, its extinction coefficient (M⁻¹cm⁻¹) and weight (Da). */
export function proteinConc(
  a280: number,
  extinction: number,
  mw: number,
  dilution = 1,
): number | null {
  return extinction > 0 && mw > 0 && dilution > 0
    ? ok(((a280 * mw) / extinction) * dilution)
    : null;
}

export type PurityVerdict = 'pure' | 'protein' | 'salt or solvent' | 'unusual';

/** What A260/A280 and A260/A230 say about a nucleic acid sample. */
export function purity(
  a260: number,
  a280: number,
  a230: number | null,
  kind: NucleicAcid,
): { r280: number | null; r230: number | null; verdicts: PurityVerdict[] } {
  const r280 = a280 > 0 ? a260 / a280 : null;
  const r230 = a230 !== null && a230 > 0 ? a260 / a230 : null;
  const verdicts: PurityVerdict[] = [];
  // About 1.8 is pure DNA and about 2.0 pure RNA.
  const expected = kind === 'RNA' ? 2.0 : 1.8;
  if (r280 !== null) {
    if (r280 < expected - 0.15) verdicts.push('protein');
    else if (r280 > expected + 0.25) verdicts.push('unusual');
  }
  if (r230 !== null && r230 < 1.8) verdicts.push('salt or solvent');
  if (verdicts.length === 0 && r280 !== null) verdicts.push('pure');
  return { r280, r230, verdicts };
}

/** ng of insert for a ligation at `ratio` insert:vector, by moles. */
export function ligationInsert(
  vectorNg: number,
  vectorBp: number,
  insertBp: number,
  ratio: number,
): number | null {
  return vectorBp > 0 ? ok(vectorNg * (insertBp / vectorBp) * ratio) : null;
}

const AVOGADRO = 6.02214076e23;
/** Average g/mol per base pair of double-stranded DNA, or per base of single strands. */
export const WEIGHT_PER_BASE = { dsDNA: 650, ssDNA: 330, RNA: 340 } as const;

/** Copies in `ng` of a molecule `length` bases (or base pairs) long. */
export function copyNumber(ng: number, length: number, kind: NucleicAcid): number | null {
  return length > 0 ? ok((ng * 1e-9 * AVOGADRO) / (length * WEIGHT_PER_BASE[kind])) : null;
}

/** GC content (0 to 1) and melting temperature (°C) of a primer, by the basic formulas. */
export function primerTm(sequence: string): { length: number; gc: number; tm: number } | null {
  const bases = sequence.toUpperCase().replace(/[^ACGTU]/g, '');
  if (bases.length === 0) return null;
  const gc = (bases.match(/[GC]/g) ?? []).length;
  const at = bases.length - gc;
  // Wallace rule for short primers; otherwise the GC formula.
  const tm = bases.length < 14 ? 2 * at + 4 * gc : 64.9 + (41 * (gc - 16.4)) / bases.length;
  return { length: bases.length, gc: gc / bases.length, tm };
}

export interface MixPart {
  name: string;
  /** µL per reaction. */
  perReaction: number;
}

/** A master mix for `reactions`, with `extra` (0.1 for 10%) for pipetting loss. */
export function masterMix(
  parts: readonly MixPart[],
  reactions: number,
  extra: number,
): { name: string; total: number }[] {
  const times = Math.max(0, reactions) * (1 + Math.max(0, extra));
  return parts.map((p) => ({ name: p.name, total: p.perReaction * times }));
}

// ---- Cells and spinning ----

/** Cells per mL from a haemocytometer: the mean count per large square × dilution × 10⁴. */
export function cellsPerMl(counts: readonly number[], dilution: number): number | null {
  if (counts.length === 0 || !(dilution > 0)) return null;
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  return ok(mean * dilution * 1e4);
}

/** Live cells as a share of all counted (0 to 1). */
export function viability(live: number, dead: number): number | null {
  return live + dead > 0 ? live / (live + dead) : null;
}

/** mL of suspension for `cellsEach` in each of `wells`. */
export function seedingVolume(perMl: number, cellsEach: number, wells: number): number | null {
  return perMl > 0 ? ok((cellsEach * wells) / perMl) : null;
}

/** Relative centrifugal force (× g) at `rpm` with rotor radius `radiusCm`. */
export function rcf(rpm: number, radiusCm: number): number | null {
  return ok(1.118e-5 * radiusCm * rpm * rpm);
}

export function rpmFor(g: number, radiusCm: number): number | null {
  return radiusCm > 0 && g >= 0 ? Math.sqrt(g / (1.118e-5 * radiusCm)) : null;
}

/** Doubling time, in the units of `elapsed`, from counts at the start and end. */
export function doublingTime(start: number, end: number, elapsed: number): number | null {
  if (!(start > 0) || !(end > start) || !(elapsed > 0)) return null;
  return (elapsed * Math.LN2) / Math.log(end / start);
}
