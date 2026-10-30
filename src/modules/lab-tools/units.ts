/**
 * Units for the calculators. Each kind of quantity has a base unit (grams,
 * litres, molar, g/L, seconds); a unit is a factor to that base.
 */

export type Kind = 'mass' | 'volume' | 'molar' | 'massConc' | 'time' | 'length';

export interface Unit {
  label: string;
  /** How many base units one of this is. */
  factor: number;
}

export const UNITS: Record<Kind, readonly Unit[]> = {
  mass: [
    { label: 'kg', factor: 1e3 },
    { label: 'g', factor: 1 },
    { label: 'mg', factor: 1e-3 },
    { label: 'µg', factor: 1e-6 },
    { label: 'ng', factor: 1e-9 },
    { label: 'pg', factor: 1e-12 },
  ],
  volume: [
    { label: 'L', factor: 1 },
    { label: 'mL', factor: 1e-3 },
    { label: 'µL', factor: 1e-6 },
    { label: 'nL', factor: 1e-9 },
  ],
  molar: [
    { label: 'M', factor: 1 },
    { label: 'mM', factor: 1e-3 },
    { label: 'µM', factor: 1e-6 },
    { label: 'nM', factor: 1e-9 },
    { label: 'pM', factor: 1e-12 },
  ],
  massConc: [
    { label: 'g/L', factor: 1 },
    { label: 'mg/mL', factor: 1 },
    { label: 'µg/mL', factor: 1e-3 },
    { label: 'ng/µL', factor: 1e-3 },
    { label: 'µg/µL', factor: 1 },
    { label: 'ng/mL', factor: 1e-6 },
  ],
  time: [
    { label: 'days', factor: 86_400 },
    { label: 'h', factor: 3_600 },
    { label: 'min', factor: 60 },
    { label: 's', factor: 1 },
  ],
  length: [
    { label: 'm', factor: 1 },
    { label: 'cm', factor: 1e-2 },
    { label: 'mm', factor: 1e-3 },
    { label: 'µm', factor: 1e-6 },
    { label: 'nm', factor: 1e-9 },
  ],
};

export function unit(kind: Kind, label: string): Unit {
  const found = UNITS[kind].find((u) => u.label === label);
  if (!found) throw new Error(`No unit ${label} for ${kind}`);
  return found;
}

/** A value in `label` units, in base units. */
export function toBase(value: number, kind: Kind, label: string): number {
  return value * unit(kind, label).factor;
}

/** A base value in `label` units. */
export function fromBase(value: number, kind: Kind, label: string): number {
  return value / unit(kind, label).factor;
}

/** Converts between two units of one kind. */
export function convert(value: number, kind: Kind, from: string, to: string): number {
  return fromBase(toBase(value, kind, from), kind, to);
}

/** A number for reading: up to `digits` significant figures, no trailing zeros. */
export function formatNumber(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return '–';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e6 || abs < 1e-4) {
    const [mantissa = '', exponent = ''] = value.toExponential(digits - 1).split('e');
    return `${trimZeros(mantissa)} × 10^${exponent.replace('+', '')}`;
  }
  return trimZeros(value.toPrecision(digits));
}

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

/**
 * A base value with the unit that reads best: the largest unit in which it
 * is at least 1, so 0.0025 L reads as 2.5 mL. Kinds whose units are not
 * all powers of the same thing (massConc) keep their first unit's family.
 */
export function formatQuantity(value: number, kind: Kind, digits = 4): string {
  if (!Number.isFinite(value)) return '–';
  const units = UNITS[kind].filter(
    (u, i, all) => all.findIndex((v) => v.factor === u.factor) === i,
  );
  const abs = Math.abs(value);
  const best =
    abs === 0
      ? (units.find((u) => u.factor === 1) ?? units[0])
      : (units.find((u) => abs / u.factor >= 1) ?? units.at(-1));
  if (!best) return formatNumber(value, digits);
  return `${formatNumber(value / best.factor, digits)} ${best.label}`;
}

/** A number typed by someone: commas as decimal points too; null if it is not one. */
export function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(',', '.').replace(/\s/g, '');
  if (cleaned === '') return null;
  // 1e-3 and 1×10^-3 both work.
  const sci = /^(-?\d*\.?\d+)\s*[x×*]\s*10\^(-?\d+)$/i.exec(cleaned);
  const value = sci ? Number(sci[1]) * 10 ** Number(sci[2]) : Number(cleaned);
  return Number.isFinite(value) ? value : null;
}
