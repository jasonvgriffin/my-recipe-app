import { generateId } from '@/lib/recipe-utils';
import type { IsoDate, MealPlanEntry, ShoppingList, ShoppingListItem } from '@/types/meal-plan';
import type { Recipe } from '@/types/recipe';

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Compile a shopping list from the meal-plan entries in a week (spec #12).
 * v1: merges identical ingredient lines (case/whitespace-insensitive) and remembers which
 * recipes each came from. TODO(spec #12): parse quantities/units and sum them.
 */
export function buildShoppingList(
  weekStart: IsoDate,
  weekDays: IsoDate[],
  entries: MealPlanEntry[],
  recipes: Recipe[],
  now: Date = new Date(),
): ShoppingList {
  const days = new Set(weekDays);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const items = new Map<string, ShoppingListItem>();
  for (const entry of entries) {
    if (!days.has(entry.date)) continue;
    const recipe = byId.get(entry.recipeId);
    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      const key = normalize(ing.text);
      if (!key) continue;
      const existing = items.get(key);
      if (existing) {
        if (!existing.recipeIds.includes(recipe.id)) existing.recipeIds.push(recipe.id);
      } else {
        items.set(key, { id: generateId(), text: ing.text.trim(), checked: false, recipeIds: [recipe.id] });
      }
    }
  }
  const ts = now.toISOString();
  return { id: `week-${weekStart}`, weekStart, items: [...items.values()], createdAt: ts, updatedAt: ts };
}

export function toggleItem(list: ShoppingList, itemId: string, now: Date = new Date()): ShoppingList {
  return {
    ...list,
    items: list.items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i)),
    updatedAt: now.toISOString(),
  };
}
