import { compileItems } from '@/lib/shopping';
import { rankRecipesByPantry } from '@/lib/pantry';
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
  it('saves name, quantity and unit only, then increments', async () => {
    const pantry = createPantryStore(memoryStore());
    const saved = await pantry.saveDetails({ name: 'Chicken Breast', quantity: 1, unit: 'lb' });
    expect(saved).toMatchObject({ name: 'chicken breast', quantity: 1, unit: 'lb' });
    const next = await pantry.addQuantity({ name: 'chicken breast', quantity: 2, unit: 'package' });
    expect(next).toMatchObject({ quantity: 3, unit: 'lb' });
  });

  it('drops category, expiry, brand and nutrition stored by older builds', async () => {
    const kv = memoryStore();
    await kv.setItem(
      PANTRY_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'p1',
          name: 'milk',
          quantity: 1,
          category: 'Dairy',
          expiresAt: '2026-10-20',
          brand: 'Acme',
          nutritionPer100g: { x: 1 },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );
    const pantry = createPantryStore(kv);
    const [item] = await pantry.list();
    expect(Object.keys(item).sort()).toEqual(['createdAt', 'id', 'name', 'quantity', 'updatedAt']);
    const saved = await pantry.addQuantity({ name: 'milk' });
    expect(saved).not.toHaveProperty('category');
    expect(saved).not.toHaveProperty('expiresAt');
  });

  it('ranks recipes by what is on hand', () => {
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
