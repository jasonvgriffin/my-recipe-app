import { createRecipe } from '@/lib/recipe-utils';
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
import { createMealPlanStore } from '@/storage/meal-plan';
import { createPantryStore } from '@/storage/pantry';
import { featureGate, LocalFreeEntitlements, NoEntitlements } from '@/entitlements';
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

describe('shopping list merge, manual lines, pantry skip (spec #12, #18)', () => {
  const bowl = createRecipe({
    title: 'Bowl',
    servings: 2,
    tags: [],
    steps: [{ text: 'Mix' }],
    ingredients: [{ text: '1 tbsp allulose' }, { text: '1 cup almond flour' }],
  });
  const extra = createRecipe({
    title: 'Extra',
    servings: 2,
    tags: [],
    steps: [{ text: 'Stir' }],
    ingredients: [{ text: '3 tsp allulose' }, { text: '2 eggs' }],
  });

  it('normalizes tbsp and tsp into one allulose line and scales servings', () => {
    const items = compileItems(
      [
        { recipe: bowl, servings: 4 },
        { recipe: extra },
      ],
      { now: NOW },
    );
    const allulose = items.find((i) => i.name === 'allulose');
    expect(allulose?.text).toBe('3 tbsp allulose');
    expect(allulose?.aisle).toBe('Pantry');
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
    expect(list.items.map((i) => i.name)).toEqual(['allulose']);
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
  it('classifies baking staples and does not special-case other sweeteners', () => {
    expect(aisleForIngredient('6 bone-in, skin-on chicken thighs')).toBe('Meat & seafood');
    expect(aisleForIngredient('1 lb green beans, trimmed')).toBe('Produce');
    expect(aisleForIngredient('1/3 cup powdered allulose')).toBe('Pantry');
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
    await pantryStore.upsert('allulose');
    expect(await pantryMatcher.isInPantry('powdered allulose')).toBe(true);

    featureGate.setProvider(new NoEntitlements());
    featureGate.setConfig({ pantry: { tier: 'premium', enabled: true } });
    expect(await pantryMatcher.isInPantry('powdered allulose')).toBe(false);
  });
});
