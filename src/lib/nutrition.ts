import type { Ingredient, NutritionPerServing } from '@/types/recipe';

import { ingredientKey } from './ingredients';
import { getUnit } from './units';

/**
 * Nutrition math (spec #17). Unknown values stay unknown — never coerce a missing
 * nutrient to 0, which would under-report carbs for a diabetic user.
 */

/** Per-100 g density from a barcode / Open Food Facts product (or any other lookup). */
export interface NutritionDensity {
  /** Product name used to match an ingredient line. */
  name: string;
  per100g: {
    calories?: number;
    carbsG?: number;
    fiberG?: number;
    proteinG?: number;
    fatG?: number;
  };
}

export interface ComputedNutrition {
  /**
   * Nutrients where every ingredient contributed a number. Fields that anyone was
   * missing are omitted (not zero). `source` is `'computed'`.
   */
  nutrition: NutritionPerServing;
  /** True when every ingredient was matched to a mass amount and at least one nutrient is known. */
  complete: boolean;
  matched: string[];
  /** Ingredients that could not be included (no mass amount, or no nutrition match). */
  missing: string[];
}

const NUTRIENTS = ['calories', 'carbsG', 'fiberG', 'proteinG', 'fatG'] as const;

/** Blank stays unknown. `0` is a real zero. Non-numeric or negative is invalid. */
export function parseNutritionField(raw: string): number | undefined | 'invalid' {
  const t = raw.trim();
  if (t === '') return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return 'invalid';
  return n;
}

const FIELD_LABELS: Record<string, string> = {
  calories: 'Calories',
  carbsG: 'Carbs',
  fiberG: 'Fiber',
  netCarbsG: 'Net carbs',
  proteinG: 'Protein',
  fatG: 'Fat',
};

/** Build a nutrition object from text fields. Empty fields are omitted, not stored as 0. */
export function nutritionFromFields(
  fields: Partial<Record<keyof NutritionPerServing, string>>,
  source: NutritionPerServing['source'],
): { ok: true; nutrition: NutritionPerServing } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const nutrition: NutritionPerServing = { source };
  for (const [key, raw] of Object.entries(fields)) {
    if (raw === undefined || key === 'source') continue;
    const parsed = parseNutritionField(raw);
    if (parsed === 'invalid') errors.push(`${FIELD_LABELS[key] ?? key} must be a number of 0 or more.`);
    else if (parsed !== undefined) (nutrition as Record<string, number | undefined>)[key] = parsed;
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, nutrition };
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match an ingredient to a product. Exact names always match. A longer phrase may
 * contain the other ("chicken thighs" ↔ "raw chicken thighs"). Single short words
 * ("oil", "salt") only match exactly, so a lookup can't attach the wrong food.
 */
export function nutritionNameMatches(ingredientName: string, productName: string): boolean {
  const a = normalizeName(ingredientName);
  const b = normalizeName(productName);
  if (!a || !b) return false;
  if (a === b) return true;
  const phrase = (needle: string, hay: string) => {
    if (needle.length < 6 && !needle.includes(' ')) return false;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^| )${escaped}(?: |$)`).test(hay);
  };
  return phrase(a, b) || phrase(b, a);
}

/** Mass in grams. Volume and count units are unknown (no density guess — that would invent carbs). */
export function quantityToGrams(quantity: number, unitId: string | undefined): number | undefined {
  if (!unitId || !Number.isFinite(quantity) || quantity < 0) return undefined;
  const unit = getUnit(unitId);
  if (!unit || unit.dimension !== 'mass') return undefined;
  return quantity * unit.toBase;
}

function roundCalories(n: number): number {
  return Math.round(n);
}

function roundMacro(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Per-serving nutrition from ingredient amounts × per-100 g data.
 * Uses the upper end of a range so carbs aren't under-counted.
 * Returns no numbers when servings aren't a positive number.
 */
export function computeRecipeNutrition(
  ingredients: Ingredient[],
  servings: number,
  sources: NutritionDensity[],
): ComputedNutrition {
  const empty: ComputedNutrition = { nutrition: { source: 'computed' }, complete: false, matched: [], missing: [] };
  if (!Number.isFinite(servings) || servings <= 0 || ingredients.length === 0) return empty;

  const rows: { label: string; grams?: number; density?: NutritionDensity['per100g'] }[] = [];
  for (const ing of ingredients) {
    const label = ing.name ?? ing.text;
    const amount = ing.quantityMax ?? ing.quantity;
    const grams = amount === undefined ? undefined : quantityToGrams(amount, ing.unit);
    const key = ingredientKey(ing);
    const density = sources.find((s) => nutritionNameMatches(key || label, s.name))?.per100g;
    rows.push({ label, grams, density });
  }

  const matched = rows
    .filter((r) => r.grams !== undefined && r.density && hasAnyNutrient(r.density))
    .map((r) => r.label);
  const missing = rows
    .filter((r) => r.grams === undefined || !r.density || !hasAnyNutrient(r.density))
    .map((r) => r.label);

  const nutrition: NutritionPerServing = { source: 'computed' };
  for (const key of NUTRIENTS) {
    let sum = 0;
    let all = true;
    for (const row of rows) {
      const value = row.density?.[key];
      if (row.grams === undefined || value === undefined) {
        all = false;
        break;
      }
      sum += (value * row.grams) / 100;
    }
    if (all) {
      const perServing = sum / servings;
      nutrition[key] = key === 'calories' ? roundCalories(perServing) : roundMacro(perServing);
    }
  }
  if (nutrition.carbsG !== undefined && nutrition.fiberG !== undefined) {
    nutrition.netCarbsG = Math.max(0, roundMacro(nutrition.carbsG - nutrition.fiberG));
  }

  const hasNumber = NUTRIENTS.some((k) => nutrition[k] !== undefined) || nutrition.netCarbsG !== undefined;
  return {
    nutrition,
    complete: missing.length === 0 && hasNumber,
    matched,
    missing,
  };
}

function hasAnyNutrient(d: NutritionDensity['per100g']): boolean {
  return NUTRIENTS.some((k) => d[k] !== undefined);
}
