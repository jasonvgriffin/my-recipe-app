import { isInPantry } from '@/pantry/isInPantry';
import type { PantryItem, Recipe } from '@/types/recipe';

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
