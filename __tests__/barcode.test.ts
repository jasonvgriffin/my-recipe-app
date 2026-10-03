import {
  createBarcodeLookup,
  normalizeBarcode,
  OFF_USER_AGENT,
  parseOpenFoodFacts,
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
    nutriments: {
      'energy-kcal_100g': 607,
      carbohydrates_100g: 21.4,
      fiber_100g: 10.7,
      proteins_100g: 21.4,
      fat_100g: 53.6,
    },
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

  it('parses Open Food Facts incl. net carbs per 100 g', () => {
    expect(parseOpenFoodFacts(EAN, OFF_OK)).toEqual({
      barcode: EAN,
      name: 'Almond Flour',
      brand: 'Bob’s Red Mill',
      quantity: '453 g',
      imageUrl: 'https://images.openfoodfacts.org/x.jpg',
      nutritionPer100g: { calories: 607, carbsG: 21.4, fiberG: 10.7, netCarbsG: 10.7, proteinG: 21.4, fatG: 53.6 },
    });
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
    expect(items[0]).toMatchObject({ name: 'almond flour', barcode: EAN, quantity: 3, unit: 'package' });
  });
});
