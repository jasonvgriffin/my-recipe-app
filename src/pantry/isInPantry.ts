import { ingredientKey, parseIngredient } from '@/lib/ingredients';
import type { Ingredient, PantryItem } from '@/types/recipe';

function keysFor(ingredient: Ingredient | string): string[] {
  if (typeof ingredient === 'string') {
    const parsed = parseIngredient(ingredient);
    return unique([ingredientKey(parsed), ingredientKey({ text: ingredient })]);
  }
  const keys = [ingredientKey(ingredient)];
  if (ingredient.text) keys.push(ingredientKey({ text: ingredient.text }));
  if (ingredient.name) keys.push(ingredientKey({ text: ingredient.name }));
  return unique(keys);
}

function unique(keys: string[]): string[] {
  return [...new Set(keys.filter(Boolean))];
}

function namesMatch(key: string, pantryName: string): boolean {
  const pk = ingredientKey({ text: pantryName });
  if (!pk || !key) return false;
  // Same rule the shopping list has used: equal, or one name contains the other.
  return pk === key || (pk.length > 2 && (key.includes(pk) || pk.includes(key)));
}

/**
 * Whether an ingredient is already on hand (spec #21).
 *
 * `ingredient` is a parsed ingredient line or free text ("2 tbsp olive oil", "chicken breast").
 * Also checks the original line, so a pantry item still matches when the parser's `name`
 * dropped part of the text (for example "bone-in, skin-on chicken thighs").
 *
 * The shopping list calls this to skip items you already have.
 */
export function isInPantry(ingredient: Ingredient | string, pantry: readonly PantryItem[]): boolean {
  const keys = keysFor(ingredient);
  if (keys.length === 0) return false;
  return pantry.some((item) => keys.some((key) => namesMatch(key, item.name)));
}
