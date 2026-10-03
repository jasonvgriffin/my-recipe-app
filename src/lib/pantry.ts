import type { PantryItem, Recipe } from '@/types/recipe';

import { ingredientKey } from './ingredients';

/** Does the pantry have this ingredient? Matches on normalized name (either contains the other). */
export function pantryHas(pantry: PantryItem[], key: string): boolean {
  if (!key) return false;
  return pantry.some((p) => {
    const pk = ingredientKey({ text: p.name });
    return pk === key || (pk.length > 2 && (key.includes(pk) || pk.includes(key)));
  });
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
        if (pantryHas(pantry, ingredientKey(ing))) have++;
        else missing.push(ing.name ?? ing.text);
      }
      return { recipe, have, total: recipe.ingredients.length, missing };
    })
    .sort((a, b) => b.have / (b.total || 1) - a.have / (a.total || 1) || b.have - a.have);
}
