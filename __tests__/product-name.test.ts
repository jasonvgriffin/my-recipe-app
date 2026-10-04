/** v1.0.7 pantry barcode names: specific product name over generic text, ALL-CAPS → title case (name/brand only). */
import { createCollection, type KeyValueStore } from '@/storage/kv';
import { createBarcodeLookup, parseOpenFoodFacts, pickProductName, tidyProductName, type BarcodeItem } from '@/pantry';

describe('tidyProductName', () => {
  it.each([
    ['CHOCOLATE CANDIES', 'Chocolate Candies'],
    ["PEANUT M&M'S", "Peanut M&M's"],
    ["peanut m&m's", "Peanut M&M's"],
    ['M&M’S MILK CHOCOLATE', 'M&M’s Milk Chocolate'],
    ['SUGAR-FREE MAPLE SYRUP', 'Sugar-Free Maple Syrup'],
    ['CREAM OF MUSHROOM SOUP', 'Cream of Mushroom Soup'],
    ['ALMOND FLOUR 32 OZ', 'Almond Flour 32 oz'],
    ['A&W ROOT BEER', 'A&W Root Beer'],
    ['7UP', '7Up'],
  ])('%s → %s', (raw, expected) => {
    expect(tidyProductName(raw)).toBe(expected);
  });

  it('keeps mixed-case names as written and tidies spaces', () => {
    expect(tidyProductName("Kerrygold Pure Irish Butter")).toBe('Kerrygold Pure Irish Butter');
    expect(tidyProductName('  iPhone   Case ')).toBe('iPhone Case');
    expect(tidyProductName('')).toBe('');
  });
});

describe('pickProductName (Open Food Facts)', () => {
  it('prefers the specific product name over generic name / category text', () => {
    expect(
      pickProductName({ product_name: "peanut m&m's", generic_name: 'CHOCOLATE CANDIES', categories: 'Chocolate candies' }),
    ).toBe("Peanut M&M's");
  });

  it('skips a product_name that only repeats the generic text when a more specific name exists', () => {
    expect(
      pickProductName({
        product_name: 'CHOCOLATE CANDIES',
        product_name_en: 'CHOCOLATE CANDIES',
        abbreviated_product_name: "PEANUT M&M'S",
        categories: 'Snacks, Chocolate candies',
      }),
    ).toBe("Peanut M&M's");
  });

  it('falls back to the generic text only when there is no product name', () => {
    expect(pickProductName({ generic_name: 'CHOCOLATE CANDIES' })).toBe('Chocolate Candies');
    expect(pickProductName({ product_name: 'CHOCOLATE CANDIES', categories: 'Chocolate candies' })).toBe('Chocolate Candies');
    expect(pickProductName({})).toBe('');
  });

  it('parseOpenFoodFacts uses it; brand still fills the brand field; never nutrition', () => {
    const product = parseOpenFoodFacts('0040000004325', {
      status: 1,
      product: {
        product_name: "peanut m&m's",
        generic_name: 'CHOCOLATE CANDIES',
        brands: "M&M'S,Mars",
        nutriments: { 'energy-kcal_100g': 500 },
      },
    });
    expect(product).toEqual({ barcode: '0040000004325', name: "Peanut M&M's", brand: "M&M's" });
  });
});

describe('cached names from older builds', () => {
  function memoryStore(): KeyValueStore {
    const data = new Map<string, string>();
    return { getItem: async (k) => data.get(k) ?? null, setItem: async (k, v) => void data.set(k, v), removeItem: async (k) => void data.delete(k) };
  }

  it('an ALL-CAPS Open Food Facts name cached by v1.0.6 comes out title-cased; user-typed names are kept', async () => {
    const items = createCollection<BarcodeItem>(memoryStore(), 'b', (v) => v as BarcodeItem);
    const ts = '2026-10-01T00:00:00.000Z';
    await items.save({ id: '1', barcode: '0040000004325', name: 'CHOCOLATE CANDIES', brand: 'MARS', source: 'openfoodfacts', createdAt: ts, updatedAt: ts });
    await items.save({ id: '2', barcode: '96385074', name: 'MY SAUCE', source: 'user', createdAt: ts, updatedAt: ts });
    const lookup = createBarcodeLookup({ items, newId: () => 'x', fetchJson: jest.fn(), canUse: () => true });
    expect(await lookup.lookup('0040000004325')).toMatchObject({ status: 'found', product: { name: 'Chocolate Candies', brand: 'Mars' } });
    expect(await lookup.lookup('96385074')).toMatchObject({ status: 'found', product: { name: 'MY SAUCE' } });
  });
});
