import { isInPantry } from '@/pantry/isInPantry';
import type { PantryItem, Recipe } from '@/types/recipe';

/** Suggested groups for the pantry form. Any other name is allowed. */
export const PANTRY_CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Frozen', 'Bakery', 'Canned', 'Spices', 'Other'] as const;

export type ExpiryState = 'none' | 'ok' | 'soon' | 'expired';

export type PantrySort = 'name' | 'expiry';

/** Categories actually used by these items, sorted (for the filter chips). */
export function pantryCategories(items: readonly PantryItem[]): string[] {
  return [...new Set(items.map((i) => i.category?.trim()).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
}

/**
 * Pantry list view: optional category filter, sorted by name or by expiration date (soonest first; items
 * without a date last, then by name).
 */
export function filterSortPantry(
  items: readonly PantryItem[],
  options: { category?: string; sort?: PantrySort } = {},
): PantryItem[] {
  const out = options.category ? items.filter((i) => i.category === options.category) : [...items];
  const byName = (a: PantryItem, b: PantryItem) => a.name.localeCompare(b.name);
  if (options.sort === 'expiry') {
    return out.sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999') || byName(a, b));
  }
  return out.sort(byName);
}

/** How close `expiresAt` (YYYY-MM-DD) is to today. `soon` is within 3 days. */
export function expiryState(expiresAt: string | undefined, today: Date = new Date()): ExpiryState {
  if (!expiresAt || !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) return 'none';
  const [y, m, d] = expiresAt.split('-').map(Number);
  const exp = new Date(y, m - 1, d);
  if (Number.isNaN(exp.getTime())) return 'none';
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = (exp.getTime() - start.getTime()) / 86_400_000;
  if (diffDays < 0) return 'expired';
  if (diffDays <= 3) return 'soon';
  return 'ok';
}

export interface PantryMatch {
  recipe: Recipe;
  have: number;
  total: number;
  missing: string[];
}

/** Suggest recipes ranked by how many ingredients are already on hand (spec #21). */
export function rankRecipesByPantry(recipes: Recipe[], pantry: PantryItem[]): PantryMatch[] {
  return recipes
    .map((recipe) => {
      const missing: string[] = [];
      let have = 0;
      for (const ing of recipe.ingredients) {
        if (isInPantry(ing, pantry)) have++;
        else missing.push(ing.name ?? ing.text);
      }
      return { recipe, have, total: recipe.ingredients.length, missing };
    })
    .sort((a, b) => b.have / (b.total || 1) - a.have / (a.total || 1) || b.have - a.have);
}
