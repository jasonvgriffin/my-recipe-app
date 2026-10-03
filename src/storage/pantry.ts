import { ingredientKey } from '@/lib/ingredients';
import { generateId } from '@/lib/recipe-utils';
import { isPantryItem, type PantryItem } from '@/types/recipe';

import { createCollection, defaultStore, type KeyValueStore } from './kv';

export const PANTRY_STORAGE_KEY = 'my-recipe-app/pantry/v1';

/** Pantry tracker (spec #21). Names are normalized so they match ingredient names. */
export function createPantryStore(store: KeyValueStore = defaultStore) {
  const items = createCollection<PantryItem>(store, PANTRY_STORAGE_KEY, (v) => (isPantryItem(v) ? v : undefined));
  return {
    async list(): Promise<PantryItem[]> {
      return (await items.all()).sort((a, b) => a.name.localeCompare(b.name));
    },
    /** Add or update by normalized name. */
    async upsert(name: string, quantity?: number, unit?: string, now: Date = new Date()): Promise<PantryItem> {
      const key = ingredientKey({ text: name });
      if (!key) throw new Error('Pantry item name is required.');
      const existing = (await items.all()).find((p) => p.name === key);
      const item: PantryItem = { id: existing?.id ?? generateId(), name: key, quantity, unit, updatedAt: now.toISOString() };
      await items.save(item);
      return item;
    },
    remove: items.remove,
  };
}

export const pantryStore = createPantryStore();
