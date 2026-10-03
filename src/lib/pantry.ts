import { isInPantry } from '@/pantry/isInPantry';
import type { PantryItem, Recipe } from '@/types/recipe';

/** Suggested groups for the pantry form. Any other name is allowed. */
export const PANTRY_CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Frozen', 'Bakery', 'Canned', 'Spices', 'Other'] as const;

export type ExpiryState = 'none' | 'ok' | 'soon' | 'expired';

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

/** Does the pantry have this ingredient key? Prefer `isInPantry` for full ingredient lines. */
export function pantryHas(pantry: PantryItem[], key: string): boolean {
  return isInPantry(key, pantry);
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
