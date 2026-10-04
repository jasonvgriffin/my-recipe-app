import { barcodeItems } from '@/pantry';
import type { Collection, StoredRecord } from '@/storage/kv';
import { mealPlanStore } from '@/storage/meal-plan';
import { pantryStore } from '@/storage/pantry';
import { recipeStore } from '@/storage/recipes';
import type { SyncTable } from '@/types/sync';

/** The app's on-device record collections (used by Backup & restore), keyed by their stable table names. */
export function appCollections(): Record<SyncTable, Collection<StoredRecord>> {
  const c = <T extends StoredRecord>(col: Collection<T>) => col as unknown as Collection<StoredRecord>;
  return {
    recipes: c(recipeStore.collections.recipes),
    categories: c(recipeStore.collections.categories),
    pantry_items: c(pantryStore.collection),
    meal_plan_entries: c(mealPlanStore.collections.entries),
    shopping_items: c(mealPlanStore.collections.items),
    barcode_items: c(barcodeItems),
  };
}
