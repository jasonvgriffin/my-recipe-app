import { isInPantry } from '@/pantry/isInPantry';
import {
  createBarcodeLookup,
  normalizeBarcode,
  OFF_PRODUCT_URL,
  OFF_USER_AGENT,
  parseOpenFoodFacts,
  withoutNutrition,
  type BarcodeItem,
} from '@/pantry/barcodeLookup';
import { createCollection, type KeyValueStore } from '@/storage/kv';
import { createPantryStore } from '@/storage/pantry';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

const EAN = '3017620422003'; // valid EAN-13 check digit
const OFF_OK = {
  status: 1,
  code: EAN,
  product: {
    product_name: 'Almond Flour',
    brands: 'Bob’s Red Mill, Other',
    quantity: '453 g',
    image_front_url: 'https://images.openfoodfacts.org/x.jpg',
    // Extra OFF data must be ignored: the pantry stores the product name and brand only (no size/image/nutrition).
    nutriments: { 'energy-kcal_100g': 607 },
  },
};

function setup(response: () => Promise<{ status: number; json: unknown }>) {
  const kv = memoryStore();
  const items = createCollection<BarcodeItem>(kv, 'barcodes', (v) => v as BarcodeItem);
  const fetchJson = jest.fn((_url: string, _headers: Record<string, string>) => response());
  let n = 0;
  const lookup = createBarcodeLookup({
    items,
    fetchJson,
    newId: () => `id-${++n}`,
    now: () => new Date('2026-10-02T12:00:00Z'),
  });
  return { kv, items, fetchJson, lookup };
}

describe('barcode lookup (spec #27)', () => {
  it('validates and normalizes EAN-13 / EAN-8 / UPC-A / UPC-E', () => {
    expect(normalizeBarcode(EAN)).toBe(EAN);
    expect(normalizeBarcode('3017620422004')).toBeUndefined(); // bad check digit
    expect(normalizeBarcode('036000291452')).toBe('0036000291452'); // UPC-A → EAN-13
    expect(normalizeBarcode('96385074')).toBe('96385074'); // EAN-8
    expect(normalizeBarcode('01234565')).toBe('01234565'); // UPC-E
    expect(normalizeBarcode('12345')).toBeUndefined();
  });

  it('parses the Open Food Facts product name and brand (never nutrition)', () => {
    expect(parseOpenFoodFacts(EAN, OFF_OK)).toEqual({
      barcode: EAN,
      name: 'Almond Flour',
      brand: 'Bob’s Red Mill',
    });
    expect(OFF_PRODUCT_URL(EAN)).not.toMatch(/nutri/);
    expect(OFF_PRODUCT_URL(EAN)).toMatch(
      /fields=code,product_name,product_name_en,abbreviated_product_name,generic_name,generic_name_en,categories,brands$/,
    );
    expect(parseOpenFoodFacts(EAN, { status: 0, status_verbose: 'product not found' })).toBeUndefined();
  });

  it('calls OFF with a descriptive User-Agent, then serves from the local cache', async () => {
    const { lookup, fetchJson } = setup(async () => ({ status: 200, json: OFF_OK }));
    const first = await lookup.lookup(EAN);
    expect(first).toMatchObject({ status: 'found', source: 'openfoodfacts', product: { name: 'Almond Flour' } });
    expect(fetchJson.mock.calls[0][0]).toContain(`/api/v2/product/${EAN}.json`);
    expect(fetchJson.mock.calls[0][1]['User-Agent']).toBe(OFF_USER_AGENT);
    expect(await lookup.lookup(EAN)).toMatchObject({ status: 'found', source: 'cache' });
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  it('not found / offline → user names it once, then it is found (shared mapping)', async () => {
    const offline = setup(async () => Promise.reject(new Error('Network request failed')));
    expect(await offline.lookup.lookup(EAN)).toMatchObject({ status: 'offline', barcode: EAN });
    await offline.lookup.saveUserProduct(EAN, 'Allulose (Wholesome)');
    expect(await offline.lookup.lookup(EAN)).toMatchObject({
      status: 'found',
      source: 'cache',
      product: { name: 'Allulose (Wholesome)' },
    });
    const stored = await offline.items.all();
    expect(stored[0]).toMatchObject({ source: 'user', barcode: EAN, updatedAt: '2026-10-02T12:00:00.000Z' });

    const missing = setup(async () => ({ status: 404, json: undefined }));
    expect(await missing.lookup.lookup(EAN)).toEqual({ status: 'not_found', barcode: EAN });
    const notInDb = setup(async () => ({ status: 200, json: { status: 0 } }));
    expect(await notInDb.lookup.lookup(EAN)).toEqual({ status: 'not_found', barcode: EAN });
    expect(await notInDb.lookup.lookup('123')).toMatchObject({ status: 'invalid' });
  });

  it('adds a scanned product to the pantry or increments the existing item', async () => {
    const pantry = createPantryStore(memoryStore());
    await pantry.addScanned({ barcode: EAN, name: 'Almond Flour', brand: 'Bob’s' });
    await pantry.addScanned({ barcode: EAN, name: 'Almond Flour' }, 2);
    const items = await pantry.list();
    expect(items).toHaveLength(1);
    // The product name is the item's title as scanned; brand is secondary (v1.0.1).
    expect(items[0]).toMatchObject({ name: 'Almond Flour', brand: 'Bob’s', barcode: EAN, quantity: 3, unit: 'package' });
    // A typed item with the same normalized name is the same item, and matching ignores case.
    await pantry.addQuantity({ name: 'almond flour' });
    expect(await pantry.list()).toHaveLength(1);
    expect(isInPantry('2 cups almond flour', await pantry.list())).toBe(true);
  });
});

describe('legacy barcode nutrition', () => {
  it('drops size, image and nutrition cached by older builds (keeps brand)', () => {
    const legacy = { barcode: EAN, name: 'Almond Flour', brand: 'B', quantity: '1 kg', nutritionPer100g: { x: 1 } };
    expect(withoutNutrition(legacy)).toEqual({ barcode: EAN, name: 'Almond Flour', brand: 'B' });
  });
});
