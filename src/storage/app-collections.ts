import type { Collection, StoredRecord } from '@/storage/kv';
import { mealPlanStore } from '@/storage/meal-plan';
import { pantryStore } from '@/storage/pantry';
import { recipeStore } from '@/storage/recipes';

/** On-device collections Backup & restore reads and writes. */
export type AppCollectionName =
  | 'recipes'
  | 'categories'
  | 'pantry_items'
  | 'meal_plan_entries'
  | 'shopping_items';

/** The app's on-device record collections (used by Backup & restore). */
export function appCollections(): Record<AppCollectionName, Collection<StoredRecord>> {
  const c = <T extends StoredRecord>(col: Collection<T>) => col as unknown as Collection<StoredRecord>;
  return {
    recipes: c(recipeStore.collections.recipes),
    categories: c(recipeStore.collections.categories),
    pantry_items: c(pantryStore.collection),
    meal_plan_entries: c(mealPlanStore.collections.entries),
    shopping_items: c(mealPlanStore.collections.items),
  };
}
