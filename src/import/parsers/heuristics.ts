import type { RecipeDraft } from '../types';

/**
 * Fallback HTML parser when a page has no schema.org Recipe JSON-LD (spec #1).
 * TODO(cloud agent): microdata (itemprop="recipeIngredient"), common plugin markup
 * (WP Recipe Maker, Tasty Recipes), <h1> title, "Ingredients"/"Instructions" lists.
 */
export function extractRecipeHeuristically(_html: string, _sourceUrl?: string): Partial<RecipeDraft> | undefined {
  return undefined;
}
