import { ingredientKey } from '@/lib/ingredients';
import { generateId } from '@/lib/recipe-utils';
import { findUnit } from '@/lib/units';
import { isPantryItem, slimPantryItem, withSyncDefaults, type PantryItem } from '@/types/recipe';

import { createCollection, defaultStore, type Collection, type KeyValueStore } from './kv';

export interface PantryWrite {
  id?: string;
  name: string;
  quantity?: number;
  unit?: string;
  barcode?: string;
}

export const PANTRY_STORAGE_KEY = 'my-recipe-app/pantry/v1';

/** Pantry tracker (spec #21). Names are normalized so they match ingredient names. */
export function createPantryStore(store: KeyValueStore = defaultStore) {
  const items = createCollection<PantryItem>(store, PANTRY_STORAGE_KEY, (v) =>
    isPantryItem(v) ? withSyncDefaults(slimPantryItem(v)) : undefined,
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
    async addScanned(product: { barcode: string; name: string }, count = 1, now: Date = new Date()) {
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
          barcode: product.barcode,
          quantity: count,
          unit: 'package',
          createdAt: ts,
          updatedAt: ts,
        },
        now,
      );
    },
    /**
     * Create or replace an item from the pantry form (spec #21).
     * Only name, quantity and unit are tracked; quantity and unit are optional.
     */
    async saveDetails(draft: PantryWrite, now: Date = new Date()): Promise<PantryItem> {
      return writeItem(items, draft, 'replace', now);
    },
    /** Add `quantity` (default 1) onto the item with this id or normalized name. Receipts and scans. */
    async addQuantity(draft: PantryWrite, now: Date = new Date()): Promise<PantryItem> {
      return writeItem(items, draft, 'add', now);
    },
    remove: (id: string) => items.remove(id),
    /** For the sync engine. */
    collection: items,
  };
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function canonUnit(unit: string | undefined): string | undefined {
  const trimmed = clean(unit);
  if (!trimmed) return undefined;
  return findUnit(trimmed)?.id ?? trimmed.toLowerCase();
}

async function writeItem(
  items: Collection<PantryItem>,
  draft: PantryWrite,
  mode: 'replace' | 'add',
  now: Date,
): Promise<PantryItem> {
  const key = ingredientKey({ text: draft.name });
  if (!key) throw new Error('Pantry item name is required.');
  if (draft.quantity !== undefined && (!Number.isFinite(draft.quantity) || draft.quantity < 0)) {
    throw new Error('Quantity must be a number of 0 or more.');
  }
  const all = await items.all();
  const byId = draft.id ? all.find((item) => item.id === draft.id) : undefined;
  const byName = all.find((item) => item.name === key && item.id !== byId?.id);
  if (byId && byName) throw new Error('You already have an item with that name.');
  const existing = byId ?? byName;
  const added = draft.quantity ?? 1;
  const quantity = mode === 'add' ? (existing?.quantity ?? 0) + added : draft.quantity;
  const ts = now.toISOString();
  const next: PantryItem = {
    ...(existing ? slimPantryItem(existing) : {}),
    id: existing?.id ?? generateId(),
    name: key,
    createdAt: existing?.createdAt ?? ts,
    updatedAt: ts,
    barcode: draft.barcode ?? existing?.barcode,
  };
  if (quantity === undefined) delete next.quantity;
  else next.quantity = quantity;
  const incomingUnit = canonUnit(draft.unit);
  const unit = mode === 'add' ? (existing?.unit ?? incomingUnit) : incomingUnit;
  if (unit) next.unit = unit;
  else delete next.unit;
  if (next.barcode === undefined) delete next.barcode;
  return items.save(next, now);
}

export const pantryStore = createPantryStore();
