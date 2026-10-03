import { compileItems } from '@/lib/shopping';
import { expiryState, filterSortPantry, pantryCategories, rankRecipesByPantry } from '@/lib/pantry';
import { isInPantry } from '@/pantry/isInPantry';
import { createRecipe } from '@/lib/recipe-utils';
import { PANTRY_STORAGE_KEY, createPantryStore } from '@/storage/pantry';
import { createReceiptAliasStore } from '@/storage/receipt-aliases';
import type { KeyValueStore } from '@/storage/kv';
import type { PantryItem } from '@/types/recipe';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

const row = (name: string): PantryItem => ({
  id: name,
  name,
  createdAt: '',
  updatedAt: '',
});

describe('isInPantry (spec #21)', () => {
  const pantry = [row('chicken thighs'), row('olive oil'), row('salt')];

  it('matches a parsed line, free text, and the original text when the parser name is incomplete', () => {
    expect(isInPantry('2 tbsp olive oil', pantry)).toBe(true);
    expect(isInPantry({ text: '1 tsp salt' }, pantry)).toBe(true);
    expect(isInPantry({ text: '6 bone-in, skin-on chicken thighs', name: 'bone-in' }, pantry)).toBe(true);
    expect(isInPantry('paprika', pantry)).toBe(false);
    expect(isInPantry('eggs', pantry)).toBe(false);
  });

  it('lets the shopping list skip pantry ingredients', () => {
    const recipe = createRecipe({
      title: 'A',
      servings: 2,
      tags: [],
      steps: [{ text: 'Cook.' }],
      ingredients: [{ text: '2 tbsp olive oil' }, { text: '2 eggs' }, { text: '6 bone-in, skin-on chicken thighs' }],
    });
    const items = compileItems([{ recipe }], { pantry });
    expect(items.map((item) => item.name)).toEqual(['eggs']);
  });
});

describe('pantry store details', () => {
  it('saves quantity, unit, category, and optional expiry, then increments', async () => {
    const pantry = createPantryStore(memoryStore());
    const saved = await pantry.saveDetails({
      name: 'Chicken Breast',
      quantity: 1,
      unit: 'lb',
      category: 'Meat',
      expiresAt: '2026-10-20',
    });
    expect(saved).toMatchObject({
      name: 'chicken breast',
      quantity: 1,
      unit: 'lb',
      category: 'Meat',
      expiresAt: '2026-10-20',
    });
    const next = await pantry.addQuantity({ name: 'chicken breast', quantity: 2, unit: 'package' });
    expect(next).toMatchObject({ quantity: 3, unit: 'lb', category: 'Meat' });
    await expect(pantry.saveDetails({ name: 'Milk', expiresAt: 'October 3' })).rejects.toThrow(/YYYY-MM-DD/);
  });

  it('saves and keeps brand; loads items saved without the optional fields; drops legacy nutrition', async () => {
    const kv = memoryStore();
    await kv.setItem(
      PANTRY_STORAGE_KEY,
      JSON.stringify([
        { id: 'p1', name: 'milk', quantity: 1, createdAt: '2026-10-03T08:00:00.000Z', updatedAt: '2026-10-03T08:00:00.000Z' },
        {
          id: 'p2',
          name: 'flour',
          category: 'Bakery',
          expiresAt: '2026-11-01',
          brand: 'King Arthur',
          nutritionPer100g: { x: 1 },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );
    const pantry = createPantryStore(kv);
    const [flour, milk] = await pantry.list();
    expect(milk).toMatchObject({ name: 'milk', quantity: 1 });
    expect(flour).toMatchObject({ category: 'Bakery', expiresAt: '2026-11-01', brand: 'King Arthur' });
    expect(flour).not.toHaveProperty('nutritionPer100g');
    const edited = await pantry.saveDetails({ id: 'p1', name: 'milk', brand: 'Horizon', category: 'Dairy', expiresAt: '2026-10-10' });
    expect(edited).toMatchObject({ brand: 'Horizon', category: 'Dairy', expiresAt: '2026-10-10' });
    expect((await pantry.addQuantity({ name: 'milk' })).brand).toBe('Horizon');
  });

  it('filters by category and sorts by expiration', () => {
    const items: PantryItem[] = [
      { ...row('yogurt'), category: 'Dairy', expiresAt: '2026-10-09' },
      { ...row('cheese'), category: 'Dairy', expiresAt: '2026-10-04' },
      { ...row('rice'), category: 'Pantry' },
      { ...row('apples'), category: 'Produce', expiresAt: '2026-10-06' },
    ];
    expect(pantryCategories(items)).toEqual(['Dairy', 'Pantry', 'Produce']);
    expect(filterSortPantry(items, { category: 'Dairy' }).map((i) => i.name)).toEqual(['cheese', 'yogurt']);
    expect(filterSortPantry(items, { sort: 'expiry' }).map((i) => i.name)).toEqual(['cheese', 'apples', 'yogurt', 'rice']);
    expect(filterSortPantry(items).map((i) => i.name)).toEqual(['apples', 'cheese', 'rice', 'yogurt']);
  });

  it('ranks recipes and describes expiry', () => {
    const recipe = createRecipe({
      title: 'Chicken',
      servings: 2,
      tags: [],
      steps: [{ text: 'Cook.' }],
      ingredients: [{ text: '2 chicken thighs' }, { text: '1 tbsp olive oil' }, { text: '1 lemon' }],
    });
    const other = createRecipe({
      title: 'Eggs',
      servings: 1,
      tags: [],
      steps: [{ text: 'Fry.' }],
      ingredients: [{ text: '2 eggs' }],
    });
    const ranked = rankRecipesByPantry([other, recipe], [row('chicken thighs'), row('olive oil')]);
    expect(ranked[0].recipe.title).toBe('Chicken');
    expect(ranked[0].have).toBe(2);
    const today = new Date(2026, 9, 3);
    expect(expiryState('2026-10-01', today)).toBe('expired');
    expect(expiryState('2026-10-05', today)).toBe('soon');
    expect(expiryState('2026-12-01', today)).toBe('ok');
    expect(expiryState(undefined, today)).toBe('none');
  });
});

describe('receipt alias store', () => {
  it('remembers a corrected name and overwrites it on the next correction', async () => {
    const aliases = createReceiptAliasStore(memoryStore());
    await aliases.remember('GV BNLS CHKN', 'Chicken Breast');
    await aliases.remember('gv bnls chkn', 'Boneless chicken breast');
    const rows = await aliases.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ alias: 'gv bnls chkn', name: 'boneless chicken breast' });
  });
});
