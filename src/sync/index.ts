/** Sync public API. See docs/SYNC.md. */
import type { Collection, StoredRecord } from '@/storage/kv';
import { mealPlanStore } from '@/storage/meal-plan';
import { pantryStore } from '@/storage/pantry';
import { barcodeItems } from '@/pantry';
import { recipeStore } from '@/storage/recipes';

import type { SyncCollections } from './types';

export { createSyncEngine, SYNC_TABLES, TOMBSTONE_TTL_DAYS } from './engine';
export { getSupabaseConfig, isSyncConfigured, type SupabaseConfig } from './config';
export type { RemoteAdapter, SyncCollections, SyncResult } from './types';

/** The app's on-device collections, keyed by Supabase table name. */
export function appSyncCollections(): SyncCollections {
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
