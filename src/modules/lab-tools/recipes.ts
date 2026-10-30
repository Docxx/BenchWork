/**
 * Common buffers and media, per litre of the strength named. Scaled to any
 * volume, and to a different strength, such as 1x from a 10x recipe.
 */

export interface Ingredient {
  name: string;
  amount: number;
  /** `g` or `mL`, per litre. */
  unit: 'g' | 'mL';
}

export interface Recipe {
  id: string;
  name: string;
  /** The strength the amounts make, such as 10 for 10x. */
  strength: number;
  ingredients: readonly Ingredient[];
  /** What to do after mixing, such as setting the pH. */
  note: string;
}

export const RECIPES: readonly Recipe[] = [
  {
    id: 'pbs',
    name: 'PBS',
    strength: 1,
    ingredients: [
      { name: 'NaCl', amount: 8, unit: 'g' },
      { name: 'KCl', amount: 0.2, unit: 'g' },
      { name: 'Na₂HPO₄', amount: 1.44, unit: 'g' },
      { name: 'KH₂PO₄', amount: 0.24, unit: 'g' },
    ],
    note: 'Dissolve in about 80% of the water, set the pH to 7.4 with HCl, then make up to volume.',
  },
  {
    id: 'tbs',
    name: 'TBS',
    strength: 1,
    ingredients: [
      { name: 'Tris base', amount: 6.06, unit: 'g' },
      { name: 'NaCl', amount: 8.77, unit: 'g' },
    ],
    note: '50 mM Tris, 150 mM NaCl. Set the pH to 7.5 with HCl before making up to volume.',
  },
  {
    id: 'tae',
    name: 'TAE',
    strength: 50,
    ingredients: [
      { name: 'Tris base', amount: 242, unit: 'g' },
      { name: 'Glacial acetic acid', amount: 57.1, unit: 'mL' },
      { name: '0.5 M EDTA, pH 8.0', amount: 100, unit: 'mL' },
    ],
    note: 'The pH should come to about 8.5 without adjusting.',
  },
  {
    id: 'tbe',
    name: 'TBE',
    strength: 10,
    ingredients: [
      { name: 'Tris base', amount: 108, unit: 'g' },
      { name: 'Boric acid', amount: 55, unit: 'g' },
      { name: '0.5 M EDTA, pH 8.0', amount: 40, unit: 'mL' },
    ],
    note: 'Store at room temperature; discard if a precipitate forms.',
  },
  {
    id: 'lb',
    name: 'LB broth',
    strength: 1,
    ingredients: [
      { name: 'Tryptone', amount: 10, unit: 'g' },
      { name: 'Yeast extract', amount: 5, unit: 'g' },
      { name: 'NaCl', amount: 10, unit: 'g' },
    ],
    note: 'Add 15 g agar per litre for plates. Autoclave.',
  },
];

/** Amounts for `litres` at `strength` (1 for 1x), from a recipe. */
export function scaleRecipe(
  recipe: Recipe,
  litres: number,
  strength: number,
): { name: string; amount: number; unit: 'g' | 'mL' }[] {
  const by = (litres * strength) / recipe.strength;
  return recipe.ingredients.map((i) => ({ name: i.name, amount: i.amount * by, unit: i.unit }));
}
