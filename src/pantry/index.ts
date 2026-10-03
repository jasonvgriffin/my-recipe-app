/** Pantry features (spec #21 pantry, #26 receipt scanning, #27 barcode scanning). */
import { generateId } from '@/lib/recipe-utils';
import { createCollection, defaultStore } from '@/storage/kv';

import { createBarcodeLookup, type BarcodeItem } from './barcodeLookup';

export * from './barcodeLookup';

export const BARCODE_ITEMS_STORAGE_KEY = 'my-recipe-app/barcode-items/v1';

const isBarcodeItem = (v: unknown): v is BarcodeItem =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as BarcodeItem).barcode === 'string' &&
  typeof (v as BarcodeItem).name === 'string';

/** Household-shared barcode mappings (synced table `barcode_items`). */
export const barcodeItems = createCollection<BarcodeItem>(defaultStore, BARCODE_ITEMS_STORAGE_KEY, (v) =>
  isBarcodeItem(v) ? v : undefined,
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
