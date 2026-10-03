import { uuid } from '@/lib/ids';
import {
  isMealPlanEntry,
  isShoppingListItem,
  type IsoDate,
  type MealPlanEntry,
  type MealSlot,
  type ShoppingList,
  type ShoppingListItem,
} from '@/types/meal-plan';
import { withSyncDefaults } from '@/types/recipe';

import { createCollection, defaultStore, type KeyValueStore } from './kv';

export const MEAL_PLAN_STORAGE_KEY = 'my-recipe-app/meal-plan/v1';
export const SHOPPING_ITEMS_STORAGE_KEY = 'my-recipe-app/shopping-items/v1';

const sameContent = (a: ShoppingListItem, b: ShoppingListItem) =>
  a.text === b.text &&
  a.checked === b.checked &&
  a.name === b.name &&
  a.aisle === b.aisle &&
  a.recipeIds.join() === b.recipeIds.join();

/** Meal plan (spec #11) + shopping list items (spec #12) — each entry/item is its own synced record (#25). */
export function createMealPlanStore(store: KeyValueStore = defaultStore) {
  const entries = createCollection<MealPlanEntry>(store, MEAL_PLAN_STORAGE_KEY, (v) =>
    isMealPlanEntry(v) ? withSyncDefaults(v) : undefined,
  );
  const items = createCollection<ShoppingListItem>(store, SHOPPING_ITEMS_STORAGE_KEY, (v) =>
    isShoppingListItem(v) ? withSyncDefaults(v) : undefined,
  );

  return {
    async entriesForDates(dates: IsoDate[]): Promise<MealPlanEntry[]> {
      const set = new Set(dates);
      return (await entries.all()).filter((e) => set.has(e.date)).sort((a, b) => a.date.localeCompare(b.date));
    },
    async addEntry(date: IsoDate, recipeId: string, slot?: MealSlot, now: Date = new Date()): Promise<MealPlanEntry> {
      const ts = now.toISOString();
      return entries.save({ id: uuid(), date, recipeId, slot, createdAt: ts, updatedAt: ts }, now);
    },
    /** Place a recipe on a day, optionally with a meal slot and a servings override (spec #11). */
    async placeEntry(
      input: { date: IsoDate; recipeId: string; slot?: MealSlot; servings?: number },
      now: Date = new Date(),
    ): Promise<MealPlanEntry> {
      const ts = now.toISOString();
      const entry: MealPlanEntry = {
        id: uuid(),
        date: input.date,
        recipeId: input.recipeId,
        createdAt: ts,
        updatedAt: ts,
      };
      if (input.slot) entry.slot = input.slot;
      if (input.servings !== undefined && input.servings > 0) entry.servings = input.servings;
      return entries.save(entry, now);
    },
    /** Move a planned meal to another day and/or slot, or change its servings override. */
    async updateEntry(
      id: string,
      patch: Partial<Pick<MealPlanEntry, 'date' | 'recipeId' | 'slot' | 'servings'>>,
      now: Date = new Date(),
    ): Promise<MealPlanEntry | undefined> {
      const existing = await entries.get(id);
      if (!existing) return undefined;
      const next: MealPlanEntry = { ...existing, ...patch };
      if (patch.servings !== undefined && !(patch.servings > 0)) delete next.servings;
      return entries.save(next, now);
    },
    removeEntry: (id: string) => entries.remove(id),
    /** Drop plan entries pointing at a deleted recipe. */
    async removeEntriesForRecipe(recipeId: string): Promise<void> {
      for (const e of await entries.all()) if (e.recipeId === recipeId) await entries.remove(e.id);
    },

    /** Assemble the list view for a week from its item rows. */
    async getShoppingList(weekStart: IsoDate): Promise<ShoppingList | undefined> {
      const weekItems = (await items.all()).filter((i) => i.weekStart === weekStart);
      if (weekItems.length === 0) return undefined;
      const times = weekItems.map((i) => i.updatedAt).sort();
      return {
        id: `week-${weekStart}`,
        weekStart,
        items: weekItems.sort((a, b) => a.createdAt.localeCompare(b.createdAt)), // stable: keeps compile order
        createdAt: weekItems.map((i) => i.createdAt).sort()[0],
        updatedAt: times[times.length - 1],
      };
    },
    /** Write only changed items (minimal sync churn); tombstone items of that week no longer in the list. */
    async saveShoppingList(list: ShoppingList, now: Date = new Date()): Promise<void> {
      const existing = new Map(
        (await items.all()).filter((i) => i.weekStart === list.weekStart).map((i) => [i.id, i] as const),
      );
      for (const item of list.items) {
        const prev = existing.get(item.id);
        existing.delete(item.id);
        if (!prev || !sameContent(prev, item)) await items.save({ ...item, weekStart: list.weekStart }, now);
      }
      for (const stale of existing.values()) await items.remove(stale.id, now);
    },
    /** For the sync engine. */
    collections: { entries, items },
  };
}

export type MealPlanStore = ReturnType<typeof createMealPlanStore>;

export const mealPlanStore = createMealPlanStore();
