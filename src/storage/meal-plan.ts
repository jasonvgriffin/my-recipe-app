import { generateId } from '@/lib/recipe-utils';
import {
  isMealPlanEntry,
  isShoppingList,
  type IsoDate,
  type MealPlanEntry,
  type MealSlot,
  type ShoppingList,
} from '@/types/meal-plan';

import { createCollection, defaultStore, type KeyValueStore } from './kv';

export const MEAL_PLAN_STORAGE_KEY = 'my-recipe-app/meal-plan/v1';
export const SHOPPING_LISTS_STORAGE_KEY = 'my-recipe-app/shopping-lists/v1';

/** Meal plan (spec #11) + shopping lists (spec #12). */
export function createMealPlanStore(store: KeyValueStore = defaultStore) {
  const entries = createCollection<MealPlanEntry>(store, MEAL_PLAN_STORAGE_KEY, (v) =>
    isMealPlanEntry(v) ? v : undefined,
  );
  const lists = createCollection<ShoppingList>(store, SHOPPING_LISTS_STORAGE_KEY, (v) =>
    isShoppingList(v) ? v : undefined,
  );

  return {
    async entriesForDates(dates: IsoDate[]): Promise<MealPlanEntry[]> {
      const set = new Set(dates);
      return (await entries.all()).filter((e) => set.has(e.date)).sort((a, b) => a.date.localeCompare(b.date));
    },
    async addEntry(date: IsoDate, recipeId: string, slot?: MealSlot, now: Date = new Date()): Promise<MealPlanEntry> {
      const entry: MealPlanEntry = { id: generateId(), date, recipeId, slot, createdAt: now.toISOString() };
      await entries.save(entry);
      return entry;
    },
    removeEntry: entries.remove,
    /** Drop plan entries pointing at a deleted recipe. */
    async removeEntriesForRecipe(recipeId: string): Promise<void> {
      await entries.replaceAll((await entries.all()).filter((e) => e.recipeId !== recipeId));
    },

    async getShoppingList(weekStart: IsoDate): Promise<ShoppingList | undefined> {
      return (await lists.all()).find((l) => l.weekStart === weekStart);
    },
    saveShoppingList: lists.save,
  };
}

export type MealPlanStore = ReturnType<typeof createMealPlanStore>;

export const mealPlanStore = createMealPlanStore();
