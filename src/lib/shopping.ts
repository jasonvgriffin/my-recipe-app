import type { IsoDate, MealPlanEntry, ShoppingList, ShoppingListItem } from '@/types/meal-plan';
import type { Ingredient, PantryItem, Recipe } from '@/types/recipe';

import { isInPantry } from '@/pantry/isInPantry';

import { formatIngredient, ingredientKey, scaleIngredient } from './ingredients';
import { generateId } from './recipe-utils';
import { getUnit } from './units';

export interface CompileOptions {
  /** Items on hand are skipped (spec #21). */
  pantry?: PantryItem[];
  /** Week the items belong to ('' for an ad-hoc grocery run of one recipe). */
  weekStart?: IsoDate;
  now?: Date;
}

/**
 * Compile a shopping list (spec #12) / grocery run (spec #18) from recipes.
 * Merges by ingredient name; quantities with the same unit (or convertible units of the same
 * dimension) are summed; servings overrides scale amounts; pantry items are skipped.
 */
export function compileItems(
  parts: { recipe: Recipe; servings?: number }[],
  options: CompileOptions = {},
): ShoppingListItem[] {
  const groups = new Map<string, { ing: Ingredient; recipeIds: string[]; summable: boolean }>();
  for (const { recipe, servings } of parts) {
    const factor = servings && recipe.servings ? servings / recipe.servings : 1;
    for (const raw of recipe.ingredients) {
      const ing = scaleIngredient(raw, factor);
      const key = ingredientKey(ing);
      if (!key || isInPantry(ing, options.pantry ?? [])) continue;
      const g = groups.get(key);
      if (!g) {
        groups.set(key, { ing: { ...ing }, recipeIds: [recipe.id], summable: ing.quantity !== undefined });
        continue;
      }
      if (!g.recipeIds.includes(recipe.id)) g.recipeIds.push(recipe.id);
      const a = g.ing;
      const ua = getUnit(a.unit);
      const ub = getUnit(ing.unit);
      if (g.summable && ing.quantity !== undefined && a.quantity !== undefined) {
        if (a.unit === ing.unit) a.quantity += ing.quantity;
        else if (ua && ub && ua.dimension === ub.dimension && ua.dimension !== 'count')
          a.quantity += (ing.quantity * ub.toBase) / ua.toBase;
        else g.summable = false;
        a.quantityMax = undefined;
      } else g.summable = false;
    }
  }
  const ts = (options.now ?? new Date()).toISOString();
  return [...groups.entries()].map(([key, g]) => ({
    id: generateId(),
    weekStart: options.weekStart ?? '',
    createdAt: ts,
    updatedAt: ts,
    text: g.summable ? formatIngredient(g.ing) : (g.ing.name ?? g.ing.text),
    name: key,
    checked: false,
    recipeIds: g.recipeIds,
  }));
}

/** Shopping list for the meal-plan entries in a week (spec #12). */
export function buildShoppingList(
  weekStart: IsoDate,
  weekDays: IsoDate[],
  entries: MealPlanEntry[],
  recipes: Recipe[],
  now: Date = new Date(),
  options: CompileOptions = {},
): ShoppingList {
  const days = new Set(weekDays);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const parts = entries
    .filter((e) => days.has(e.date) && byId.has(e.recipeId))
    .map((e) => ({ recipe: byId.get(e.recipeId)!, servings: e.servings }));
  const ts = now.toISOString();
  return {
    id: `week-${weekStart}`,
    weekStart,
    items: compileItems(parts, { ...options, weekStart, now }),
    createdAt: ts,
    updatedAt: ts,
  };
}

export function toggleItem(list: ShoppingList, itemId: string, now: Date = new Date()): ShoppingList {
  return {
    ...list,
    items: list.items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked, updatedAt: now.toISOString() } : i)),
    updatedAt: now.toISOString(),
  };
}
