/**
 * What the inventory holds. Each item is a record, a small YAML file such
 * as `Inventory/Fly stocks/w1118.flystock.yaml`, so items link with
 * `[[w1118]]`, are found by search, and stay readable without BenchWork.
 */

export type FieldKind = 'text' | 'date' | 'number' | 'link' | 'choice' | 'long';

export interface Field {
  key: string;
  label: string;
  kind: FieldKind;
  /** For `choice`. */
  options?: readonly string[];
  /** A short example, shown in the empty box. */
  hint?: string;
}

export interface ItemKind {
  /** The record kind, as in `<name>.<kind>.yaml`. */
  kind: string;
  /** One of them, as in "New fly stock". */
  one: string;
  /** All of them, as a tab and a folder name. */
  many: string;
  folder: string;
  fields: readonly Field[];
  /** Fields shown as table columns, after the name. */
  columns: readonly string[];
}

export const FLY_STOCK: ItemKind = {
  kind: 'flystock',
  one: 'fly stock',
  many: 'Fly stocks',
  folder: 'Inventory/Fly stocks',
  fields: [
    { key: 'genotype', label: 'Genotype', kind: 'text', hint: 'w[1118]' },
    { key: 'source', label: 'Source', kind: 'text', hint: 'BDSC 5905' },
    { key: 'location', label: 'Where it is', kind: 'text', hint: '25 °C rack B' },
    { key: 'flipEvery', label: 'Flip every (days)', kind: 'number', hint: '14' },
    { key: 'lastFlipped', label: 'Last flipped', kind: 'date' },
    { key: 'notes', label: 'Notes', kind: 'long' },
  ],
  columns: ['genotype', 'location', 'lastFlipped'],
};

export const CROSS: ItemKind = {
  kind: 'cross',
  one: 'cross',
  many: 'Crosses',
  folder: 'Inventory/Crosses',
  fields: [
    { key: 'female', label: 'Virgin females', kind: 'link', hint: '[[w1118]]' },
    { key: 'male', label: 'Males', kind: 'link', hint: '[[elav-GAL4]]' },
    { key: 'started', label: 'Set up', kind: 'date' },
    {
      key: 'status',
      label: 'Status',
      kind: 'choice',
      options: ['Set up', 'Collecting', 'Done'],
    },
    { key: 'purpose', label: 'For', kind: 'text', hint: 'Climbing assay' },
    { key: 'notes', label: 'Notes', kind: 'long' },
  ],
  columns: ['female', 'male', 'started', 'status'],
};

export const REAGENT: ItemKind = {
  kind: 'reagent',
  one: 'reagent',
  many: 'Reagents',
  folder: 'Inventory/Reagents',
  fields: [
    { key: 'supplier', label: 'Supplier', kind: 'text', hint: 'Sigma' },
    { key: 'catalogue', label: 'Catalogue number', kind: 'text' },
    { key: 'lot', label: 'Lot', kind: 'text' },
    { key: 'amount', label: 'Amount', kind: 'text', hint: '500 mL' },
    { key: 'location', label: 'Where it is', kind: 'text', hint: 'Fridge 2, shelf 1' },
    { key: 'expires', label: 'Expires', kind: 'date' },
    { key: 'notes', label: 'Notes', kind: 'long' },
  ],
  columns: ['supplier', 'amount', 'location', 'expires'],
};

export const ANTIBODY: ItemKind = {
  kind: 'antibody',
  one: 'antibody',
  many: 'Antibodies',
  folder: 'Inventory/Antibodies',
  fields: [
    { key: 'target', label: 'Target', kind: 'text', hint: 'Tau' },
    { key: 'host', label: 'Raised in', kind: 'text', hint: 'Mouse' },
    { key: 'clone', label: 'Clone', kind: 'text' },
    { key: 'supplier', label: 'Supplier', kind: 'text' },
    { key: 'catalogue', label: 'Catalogue number', kind: 'text' },
    { key: 'dilution', label: 'Dilution', kind: 'text', hint: 'WB 1:1000, IF 1:200' },
    { key: 'location', label: 'Where it is', kind: 'text', hint: '-20 °C box 3' },
    { key: 'notes', label: 'Notes', kind: 'long' },
  ],
  columns: ['target', 'host', 'dilution', 'location'],
};

export const KINDS: readonly ItemKind[] = [FLY_STOCK, CROSS, REAGENT, ANTIBODY];

/** A value as text for a table or a form: dates as `YYYY-MM-DD`. */
export function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** What a link field shows: `[[w1118|wild type]]` as "wild type". */
export function linkLabel(value: string): string {
  return value.replace(/\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g, (_w, t: string, a?: string) =>
    (a ?? t).trim(),
  );
}
