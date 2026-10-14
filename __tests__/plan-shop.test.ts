import { createRecipe } from '@/lib/recipe-utils';
import { defaultMealCategoryId, groupMealPlanEntries, resolveMealSlot } from '@/lib/meal-plan';
import { addDays, formatMonthYear, inMonth, monthGrid, weekDates } from '@/lib/dates';
import { aisleForIngredient } from '@/lib/aisles';
import {
  addManualItem,
  clearChecked,
  compileItems,
  compileRecipeShoppingList,
  compileWeekShoppingList,
  emptyShoppingList,
  groupByAisle,
  reconcileShoppingList,
  setItemChecked,
  shoppingProgress,
} from '@/lib/shopping';
import { createPantryMatcher, isInPantry, pantryMatcher } from '@/pantry';
import { createMealPlanStore, MEAL_PLAN_STORAGE_KEY } from '@/storage/meal-plan';
import { createPantryStore } from '@/storage/pantry';
import { featureGate, LocalFreeEntitlements, NoEntitlements } from '@/entitlements';
import type { KeyValueStore } from '@/storage/kv';
import { isMealPlanEntry, type MealPlanEntry } from '@/types/meal-plan';
import type { PantryItem } from '@/types/recipe';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

const NOW = new Date('2026-10-03T15:00:00Z');

describe('calendar dates (spec #11)', () => {
  it('builds a Monday-start month grid and shifts days', () => {
    const grid = monthGrid(2026, 9); // October 2026
    expect(grid[0]).toBe('2026-09-28');
    expect(grid[grid.length - 1]).toBe('2026-11-01');
    expect(grid).toHaveLength(35);
    expect(grid.filter((d) => inMonth(d, 2026, 9))).toHaveLength(31);
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
    expect(formatMonthYear(2026, 9)).toBe('October 2026');
  });
});

describe('meal plan moves (spec #11)', () => {
  it('places, moves, and removes an entry', async () => {
    const plan = createMealPlanStore(memoryStore());
    const placed = await plan.placeEntry({ date: '2026-10-03', recipeId: 'r1', slot: 'dinner', servings: 4 }, NOW);
    expect(placed).toMatchObject({ date: '2026-10-03', slot: 'dinner', servings: 4 });
    await plan.updateEntry(placed.id, { date: '2026-10-04', slot: 'lunch' }, NOW);
    const moved = await plan.entriesForDates(['2026-10-04']);
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ slot: 'lunch', servings: 4 });
    expect(await plan.entriesForDates(['2026-10-03'])).toHaveLength(0);
    await plan.removeEntry(placed.id);
    expect(await plan.entriesForDates(weekDates('2026-09-28'))).toHaveLength(0);
  });
});

describe('meal slot labels', () => {
  const categories = [
    { id: 'b', name: 'Breakfast' },
    { id: 'l', name: 'Lunch' },
    { id: 'd', name: 'Dinner' },
    { id: 'g', name: 'Get me laid' },
  ];
  const entry = (id: string, slot?: string): MealPlanEntry => ({
    id,
    date: '2026-10-03',
    recipeId: 'r1',
    slot,
    createdAt: '',
    updatedAt: '',
  });

  it('resolves a category id, then a legacy name, and keeps a missing slot as Any time', () => {
    expect(resolveMealSlot(undefined, categories)).toMatchObject({ key: 'any', label: 'Any time' });
    expect(resolveMealSlot('  ', categories)).toMatchObject({ key: 'any', label: 'Any time' });
    expect(resolveMealSlot('d', categories)).toMatchObject({ key: 'd', label: 'Dinner', categoryId: 'd' });
    expect(resolveMealSlot('DINNER', categories)).toMatchObject({ key: 'd', label: 'Dinner', categoryId: 'd' });
    expect(resolveMealSlot('lunch', categories)).toMatchObject({ key: 'l', label: 'Lunch', categoryId: 'l' });
    expect(resolveMealSlot('snack', categories)).toEqual({ key: 'legacy:snack', label: 'Snack' });
    expect(resolveMealSlot('snack', [])).toEqual({ key: 'legacy:snack', label: 'Snack' });
    expect(resolveMealSlot('breakfast', categories.filter((c) => c.id !== 'b'))).toEqual({
      key: 'legacy:breakfast',
      label: 'Breakfast',
    });
    expect(resolveMealSlot('gone-id', categories)).toEqual({ key: 'removed:gone-id', label: 'Category removed' });
    expect(resolveMealSlot('snack', [...categories, { id: 's', name: 'Snack' }])).toMatchObject({
      key: 's',
      label: 'Snack',
      categoryId: 's',
    });
  });

  it('groups by category order, then an unmatched legacy snack, then a removed category', () => {
    const groups = groupMealPlanEntries(
      [entry('any'), entry('snack', 'snack'), entry('gone', 'gone-id'), entry('dinner', 'dinner'), entry('custom', 'g')],
      categories,
    );
    expect(groups.map((g) => g.label)).toEqual(['Any time', 'Dinner', 'Get me laid', 'Snack', 'Category removed']);
    expect(groups.map((g) => g.items.map((item) => item.id))).toEqual([['any'], ['dinner'], ['custom'], ['snack'], ['gone']]);
    expect(groups.find((g) => g.label === 'Breakfast')).toBeUndefined();
  });

  it('starts the add chip on Dinner, or the first category when Dinner is gone', () => {
    expect(defaultMealCategoryId(categories)).toBe('d');
    expect(defaultMealCategoryId(categories.filter((c) => c.name !== 'Dinner'))).toBe('b');
    expect(defaultMealCategoryId([])).toBeUndefined();
  });

  it('placeEntry accepts a category id and a legacy slot, and a backup dinner row still loads', async () => {
    const plan = createMealPlanStore(memoryStore());
    const byId = await plan.placeEntry({ date: '2026-10-03', recipeId: 'r1', slot: 'cat-123', servings: 2 }, NOW);
    expect(byId.slot).toBe('cat-123');
    const legacy = await plan.addEntry('2026-10-04', 'r2', 'breakfast', NOW);
    expect(legacy.slot).toBe('breakfast');

    const kv = memoryStore();
    await kv.setItem(
      MEAL_PLAN_STORAGE_KEY,
      JSON.stringify([{ id: 'old', date: '2026-10-03', recipeId: 'r1', slot: 'dinner', createdAt: '', updatedAt: '' }]),
    );
    const loaded = await createMealPlanStore(kv).entriesForDates(['2026-10-03']);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].slot).toBe('dinner');
    expect(isMealPlanEntry({ id: '1', date: '2026-10-03', recipeId: 'r', slot: 'snack' })).toBe(true);
    expect(isMealPlanEntry({ id: '1', date: '2026-10-03', recipeId: 'r', slot: 'cat-123' })).toBe(true);
    expect(isMealPlanEntry({ id: '1', date: '2026-10-03', recipeId: 'r' })).toBe(true);
    expect(isMealPlanEntry({ date: '2026-10-03', recipeId: 'r' })).toBe(false);
  });
});

describe('shopping list merge, manual lines, pantry skip (spec #12, #18)', () => {
  const bowl = createRecipe({
    title: 'Bowl',
    servings: 2,
    tags: [],
    steps: [{ text: 'Mix' }],
    ingredients: [{ text: '1 tbsp cocoa' }, { text: '1 cup almond flour' }],
  });
  const extra = createRecipe({
    title: 'Extra',
    servings: 2,
    tags: [],
    steps: [{ text: 'Stir' }],
    ingredients: [{ text: '3 tsp cocoa' }, { text: '2 eggs' }],
  });

  it('normalizes tbsp and tsp into one cocoa line and scales servings', () => {
    const items = compileItems(
      [
        { recipe: bowl, servings: 4 },
        { recipe: extra },
      ],
      { now: NOW },
    );
    const cocoa = items.find((i) => i.name === 'cocoa');
    expect(cocoa?.text).toBe('3 tbsp cocoa');
    expect(cocoa?.aisle).toBe('Pantry');
    expect(items.find((i) => i.name === 'eggs')?.aisle).toBe('Dairy & eggs');
  });

  it('keeps checks and manual items across a rebuild, then clears checked lines', () => {
    const entries = [
      { id: 'e1', date: '2026-10-03', recipeId: bowl.id, slot: 'dinner' as const, createdAt: '', updatedAt: '' },
    ];
    const first = compileWeekShoppingList('2026-09-28', entries, [bowl, extra], undefined, undefined, NOW);
    const checked = setItemChecked(first, first.items[0].id, true, NOW);
    const withManual = addManualItem(checked, '2 lemons', NOW);
    const rebuilt = compileWeekShoppingList('2026-09-28', entries, [bowl, extra], withManual, undefined, NOW);
    const kept = rebuilt.items.find((i) => i.name === checked.items[0].name);
    expect(kept?.checked).toBe(true);
    expect(kept?.id).toBe(checked.items[0].id);
    expect(rebuilt.items.some((i) => i.text === '2 lemons' && i.recipeIds.length === 0)).toBe(true);
    const cleared = clearChecked(rebuilt, NOW);
    expect(cleared.items.every((i) => !i.checked)).toBe(true);
    expect(cleared.items.some((i) => i.text === '2 lemons')).toBe(true);
  });

  it('skips pantry keys supplied by isInPantry and groups the rest by aisle', () => {
    const pantry: PantryItem[] = [{ id: 'p', name: 'almond flour', createdAt: '', updatedAt: '' }];
    expect(isInPantry('1 cup almond flour', pantry)).toBe(true);
    const list = compileWeekShoppingList(
      '2026-09-28',
      [{ id: 'e', date: '2026-10-03', recipeId: bowl.id, createdAt: '', updatedAt: '' }],
      [bowl],
      undefined,
      (key) => isInPantry(key, pantry),
      NOW,
    );
    expect(list.items.map((i) => i.name)).toEqual(['cocoa']);
    expect(groupByAisle(list.items).map((g) => g.aisle)).toEqual(['Pantry']);
    expect(shoppingProgress(list.items)).toEqual({ checked: 0, total: 1, fraction: 0 });
  });

  it('compiles one recipe without mixing it into a week list', () => {
    const run = compileRecipeShoppingList(bowl, undefined, undefined, NOW);
    expect(run.weekStart).toBe(`recipe:${bowl.id}`);
    expect(reconcileShoppingList(run, run).items.map((i) => i.id)).toEqual(run.items.map((i) => i.id));
    expect(emptyShoppingList('2026-09-28', NOW).items).toEqual([]);
  });
});

describe('aisles (spec #18)', () => {
  it('classifies baking staples', () => {
    expect(aisleForIngredient('6 bone-in, skin-on chicken thighs')).toBe('Meat & seafood');
    expect(aisleForIngredient('1 lb green beans, trimmed')).toBe('Produce');
    expect(aisleForIngredient('1/3 cup powdered cocoa')).toBe('Pantry');
    expect(aisleForIngredient('1 tsp dried thyme')).toBe('Spices');
    expect(aisleForIngredient('8 oz cream cheese')).toBe('Dairy & eggs');
    expect(aisleForIngredient('something unfamiliar')).toBe('Other');
  });
});

describe('isInPantry (spec #12, #21)', () => {
  afterEach(() => {
    featureGate.resetConfig();
    featureGate.setProvider(new LocalFreeEntitlements());
  });

  it('matches on hand items and returns false when pantry is gated off', async () => {
    const pantry = createPantryStore(memoryStore());
    await pantry.upsert('olive oil', 1, 'bottle', NOW);
    const matcher = createPantryMatcher({ list: () => pantry.list() });
    expect(await matcher.isInPantry('2 tbsp olive oil')).toBe(true);
    expect(await matcher.isInPantry('green beans')).toBe(false);
    expect([...(await matcher.skipKeys(['olive oil', 'green beans']))]).toEqual(['olive oil']);

    const blocked = createPantryMatcher({ list: () => pantry.list(), canUsePantry: () => false });
    expect(await blocked.isInPantry('olive oil')).toBe(false);
    expect(await blocked.skipKeys(['olive oil'])).toEqual(new Set());
  });

  it('the app binding follows the feature gate', async () => {
    const { pantryStore } = require('@/storage/pantry') as typeof import('@/storage/pantry');
    await require('@react-native-async-storage/async-storage').clear();
    await pantryStore.upsert('cocoa');
    expect(await pantryMatcher.isInPantry('powdered cocoa')).toBe(true);

    featureGate.setProvider(new NoEntitlements());
    featureGate.setConfig({ pantry: { tier: 'premium', enabled: true } });
    expect(await pantryMatcher.isInPantry('powdered cocoa')).toBe(false);
  });
});
