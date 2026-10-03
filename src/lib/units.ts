import type { UnitSystem } from '@/types/recipe';

/**
 * Unit table for parsing, scaling and metric<->imperial conversion (spec #16).
 * `toBase` converts 1 unit into the base unit of its dimension (ml for volume, g for mass).
 */
export interface UnitDef {
  id: string;
  dimension: 'volume' | 'mass' | 'count';
  system: UnitSystem | 'both';
  toBase: number;
  aliases: string[];
}

export const UNITS: UnitDef[] = [
  { id: 'tsp', dimension: 'volume', system: 'imperial', toBase: 4.92892, aliases: ['tsp', 'teaspoon', 'teaspoons', 't'] },
  { id: 'tbsp', dimension: 'volume', system: 'imperial', toBase: 14.7868, aliases: ['tbsp', 'tbs', 'tablespoon', 'tablespoons', 'T'] },
  { id: 'fl oz', dimension: 'volume', system: 'imperial', toBase: 29.5735, aliases: ['fl oz', 'fl. oz', 'fluid ounce', 'fluid ounces'] },
  { id: 'cup', dimension: 'volume', system: 'imperial', toBase: 236.588, aliases: ['cup', 'cups', 'c'] },
  { id: 'pint', dimension: 'volume', system: 'imperial', toBase: 473.176, aliases: ['pint', 'pints', 'pt'] },
  { id: 'quart', dimension: 'volume', system: 'imperial', toBase: 946.353, aliases: ['quart', 'quarts', 'qt'] },
  { id: 'gallon', dimension: 'volume', system: 'imperial', toBase: 3785.41, aliases: ['gallon', 'gallons', 'gal'] },
  { id: 'ml', dimension: 'volume', system: 'metric', toBase: 1, aliases: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'] },
  { id: 'l', dimension: 'volume', system: 'metric', toBase: 1000, aliases: ['l', 'liter', 'liters', 'litre', 'litres'] },
  { id: 'oz', dimension: 'mass', system: 'imperial', toBase: 28.3495, aliases: ['oz', 'ounce', 'ounces'] },
  { id: 'lb', dimension: 'mass', system: 'imperial', toBase: 453.592, aliases: ['lb', 'lbs', 'pound', 'pounds'] },
  { id: 'g', dimension: 'mass', system: 'metric', toBase: 1, aliases: ['g', 'gram', 'grams', 'gr'] },
  { id: 'kg', dimension: 'mass', system: 'metric', toBase: 1000, aliases: ['kg', 'kilogram', 'kilograms'] },
  ...['clove', 'pinch', 'dash', 'can', 'slice', 'stick', 'head', 'bunch', 'package', 'piece'].map(
    (id): UnitDef => ({ id, dimension: 'count', system: 'both', toBase: 1, aliases: [id, `${id}s`, `${id}es`] }),
  ),
];

const BY_ALIAS = new Map<string, UnitDef>();
for (const u of UNITS)
  for (const a of u.aliases) {
    // Case-sensitive single letters ("T" = tbsp, "t" = tsp); everything else case-insensitive.
    BY_ALIAS.set(a.length === 1 ? a : a.toLowerCase(), u);
  }

export function findUnit(token: string): UnitDef | undefined {
  const t = token.replace(/\.$/, '');
  return BY_ALIAS.get(t.length === 1 ? t : t.toLowerCase());
}

export function getUnit(id: string | undefined): UnitDef | undefined {
  return id ? UNITS.find((u) => u.id === id) : undefined;
}

/** Preferred display units per system, largest first; we pick the largest giving a value >= 1. */
const TARGETS: Record<UnitSystem, Record<'volume' | 'mass', string[]>> = {
  metric: { volume: ['l', 'ml'], mass: ['kg', 'g'] },
  imperial: { volume: ['cup', 'tbsp', 'tsp'], mass: ['lb', 'oz'] },
};

/**
 * Convert an amount to the target system. Count units and amounts already in the target system
 * are returned unchanged. Small imperial volumes (tsp/tbsp) stay as-is when converting to imperial.
 */
export function convertAmount(
  quantity: number,
  unitId: string,
  target: UnitSystem,
): { quantity: number; unit: string } {
  const unit = getUnit(unitId);
  if (!unit || unit.dimension === 'count' || unit.system === target || unit.system === 'both')
    return { quantity, unit: unitId };
  const base = quantity * unit.toBase;
  const candidates = TARGETS[target][unit.dimension];
  for (const id of candidates) {
    const v = base / getUnit(id)!.toBase;
    if (v >= 1 || id === candidates[candidates.length - 1]) return { quantity: roundNice(v), unit: id };
  }
  return { quantity, unit: unitId };
}

/** Round to a kitchen-friendly precision. */
export function roundNice(v: number): number {
  if (v >= 100) return Math.round(v);
  if (v >= 10) return Math.round(v * 2) / 2;
  return Math.round(v * 100) / 100;
}
