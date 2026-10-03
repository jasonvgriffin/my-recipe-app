import { ingredientKey } from '@/lib/ingredients';
import { generateId } from '@/lib/recipe-utils';
import { isPantryItem, withSyncDefaults, type PantryItem } from '@/types/recipe';

import { createCollection, defaultStore, type KeyValueStore } from './kv';

export const PANTRY_STORAGE_KEY = 'my-recipe-app/pantry/v1';

/** Pantry tracker (spec #21). Names are normalized so they match ingredient names. */
export function createPantryStore(store: KeyValueStore = defaultStore) {
  const items = createCollection<PantryItem>(store, PANTRY_STORAGE_KEY, (v) =>
    isPantryItem(v) ? withSyncDefaults(v) : undefined,
  );
  return {
    async list(): Promise<PantryItem[]> {
      return (await items.all()).sort((a, b) => a.name.localeCompare(b.name));
    },
    /** Add or update by normalized name. */
    async upsert(name: string, quantity?: number, unit?: string, now: Date = new Date()): Promise<PantryItem> {
      const key = ingredientKey({ text: name });
      if (!key) throw new Error('Pantry item name is required.');
      const existing = (await items.all()).find((p) => p.name === key);
      const item: PantryItem = {
        ...existing,
        id: existing?.id ?? generateId(),
        name: key,
        quantity,
        unit,
        createdAt: existing?.createdAt ?? now.toISOString(),
        updatedAt: now.toISOString(),
      };
      return items.save(item, now);
    },
    /**
     * Add a scanned product (spec #27) or increment the existing item with the same barcode or name.
     * `count` = number of packages scanned.
     */
    async addScanned(product: { barcode: string; name: string; brand?: string }, count = 1, now: Date = new Date()) {
      const key = ingredientKey({ text: product.name });
      const all = await items.all();
      const existing = all.find((p) => p.barcode === product.barcode) ?? all.find((p) => p.name === key);
      const ts = now.toISOString();
      if (existing) {
        return items.save(
          { ...existing, barcode: existing.barcode ?? product.barcode, quantity: (existing.quantity ?? 0) + count },
          now,
        );
      }
      return items.save(
        {
          id: generateId(),
          name: key,
          brand: product.brand,
          barcode: product.barcode,
          quantity: count,
          unit: 'package',
          createdAt: ts,
          updatedAt: ts,
        },
        now,
      );
    },
    remove: (id: string) => items.remove(id),
    /** For the sync engine. */
    collection: items,
  };
}

export const pantryStore = createPantryStore();
