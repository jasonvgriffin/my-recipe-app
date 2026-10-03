/** Pantry features (spec #21 pantry, #26 receipt scanning, #27 barcode scanning). */
import { canUse } from '@/entitlements';
import { generateId } from '@/lib/recipe-utils';
import { createCollection, defaultStore } from '@/storage/kv';
import { pantryStore } from '@/storage/pantry';
import { settingsStore } from '@/storage/settings';

import { createBarcodeLookup, withoutNutrition, type BarcodeItem } from './barcodeLookup';
import { createPantryMatcher } from './match';

export * from './barcodeLookup';
export { createPantryMatcher, ingredientIsInPantry, type PantryMatcher, type PantryMatcherDeps } from './match';

export const BARCODE_ITEMS_STORAGE_KEY = 'my-recipe-app/barcode-items/v1';

const isBarcodeItem = (v: unknown): v is BarcodeItem =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as BarcodeItem).barcode === 'string' &&
  typeof (v as BarcodeItem).name === 'string';

/** Household-shared barcode mappings (synced table `barcode_items`). */
export const barcodeItems = createCollection<BarcodeItem>(defaultStore, BARCODE_ITEMS_STORAGE_KEY, (v) =>
  isBarcodeItem(v) ? withoutNutrition(v) : undefined,
);

/** App-wide lookup bound to on-device storage + global fetch. */
export const barcodeLookup = createBarcodeLookup({
  items: barcodeItems,
  newId: generateId,
  fetchJson: async (url, headers) => {
    const res = await fetch(url, { headers });
    return { status: res.status, json: res.status === 200 ? await res.json() : undefined };
  },
});

/**
 * On-hand check used by the shopping list and grocery run.
 * Returns false when the pantry feature is gated off or hidden in Settings, so a locked or hidden
 * pantry never changes what you buy.
 */
export const pantryMatcher = createPantryMatcher({
  list: async () => ((await settingsStore.get()).features.pantry ? pantryStore.list() : []),
  canUsePantry: () => canUse('pantry'),
});

/**
 * Async, storage-bound check (respects gate + Settings). For a pure check against a pantry list,
 * import `isInPantry` from `@/pantry/isInPantry`.
 */
export function isInPantry(ingredient: string): Promise<boolean> {
  return pantryMatcher.isInPantry(ingredient);
}
