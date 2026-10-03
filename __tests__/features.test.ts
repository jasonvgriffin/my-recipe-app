import { SEED_RECIPES } from '@/data/seed';
import { startOfWeek, toIsoDate, weekDates } from '@/lib/dates';
import { filterRecipes, setCooked } from '@/lib/recipe-utils';
import { buildShoppingList, toggleItem } from '@/lib/shopping';
import { createMealPlanStore } from '@/storage/meal-plan';
import { createRecipeStore, RECIPES_STORAGE_KEY, type KeyValueStore } from '@/storage/recipes';
import { migrateRecipe, RECIPE_SCHEMA_VERSION } from '@/types/recipe';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

const NOW = new Date('2026-10-02T12:00:00Z');
const [chicken, mousse] = SEED_RECIPES;

describe('schema migration', () => {
  it('upgrades a v1 recipe (no categories / cooked fields)', () => {
    const { categoryIds, cooked, ...v1 } = chicken;
    void categoryIds;
    void cooked;
    const migrated = migrateRecipe({ ...v1, schemaVersion: 1 });
    expect(migrated).toMatchObject({ categoryIds: [], cooked: false, schemaVersion: RECIPE_SCHEMA_VERSION });
  });

  it('store reads v1 data transparently', async () => {
    const kv = memoryStore();
    const { categoryIds, cooked, ...v1 } = mousse;
    void categoryIds;
    void cooked;
    kv.data.set(RECIPES_STORAGE_KEY, JSON.stringify([v1]));
    expect((await createRecipeStore(kv).get(mousse.id))?.categoryIds).toEqual([]);
  });
});

describe('cooked tracking + filters (spec #9, #10)', () => {
  it('filters by cooked, recently cooked, keyword and category', () => {
    const cookedLongAgo = setCooked(chicken, true, new Date('2026-08-01T00:00:00Z'));
    const cookedRecently = { ...setCooked(mousse, true, new Date('2026-09-30T00:00:00Z')), categoryIds: ['desserts'] };
    const all = [cookedLongAgo, cookedRecently];
    expect(filterRecipes(all, { cooked: true }, NOW)).toHaveLength(2);
    expect(filterRecipes(all, { cookedWithinDays: 14 }, NOW).map((r) => r.id)).toEqual([mousse.id]);
    expect(filterRecipes(all, { keyword: 'thyme' }, NOW).map((r) => r.id)).toEqual([chicken.id]);
    expect(filterRecipes(all, { categoryId: 'desserts' }, NOW).map((r) => r.id)).toEqual([mousse.id]);
    const uncooked = setCooked(cookedLongAgo, false, NOW);
    expect(uncooked.cooked).toBe(false);
    expect(uncooked.lastCookedAt).toBe(cookedLongAgo.lastCookedAt); // history kept
  });
});

describe('categories (spec #3)', () => {
  it('adds (deduped), renames and removes categories, unassigning recipes', async () => {
    const store = createRecipeStore(memoryStore());
    await store.seedIfNeeded();
    const breads = await store.addCategory('Breads');
    expect((await store.addCategory(' breads ')).id).toBe(breads.id);
    await store.save({ ...chicken, categoryIds: [breads.id] });
    await store.renameCategory(breads.id, 'Breads & Rolls');
    expect((await store.listCategories()).map((c) => c.name)).toEqual(['Breads & Rolls']);
    await store.removeCategory(breads.id);
    expect((await store.get(chicken.id))?.categoryIds).toEqual([]);
  });
});

describe('meal plan + shopping list (spec #11, #12)', () => {
  it('computes week dates starting Monday', () => {
    const start = toIsoDate(startOfWeek(new Date(2026, 9, 2))); // Fri Oct 2 2026
    expect(start).toBe('2026-09-28');
    expect(weekDates(start)).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ]);
  });

  it('compiles a deduped shopping list from planned recipes in the week', async () => {
    const plan = createMealPlanStore(memoryStore());
    const days = weekDates('2026-09-28');
    await plan.addEntry('2026-09-29', chicken.id, 'dinner');
    await plan.addEntry('2026-10-01', chicken.id, 'dinner');
    await plan.addEntry('2026-10-02', mousse.id);
    await plan.addEntry('2026-10-10', mousse.id); // next week, excluded
    const entries = await plan.entriesForDates(days);
    expect(entries).toHaveLength(3);
    const list = buildShoppingList('2026-09-28', days, entries, SEED_RECIPES, NOW);
    expect(list.items).toHaveLength(chicken.ingredients.length + mousse.ingredients.length);
    const toggled = toggleItem(list, list.items[0].id, NOW);
    expect(toggled.items[0].checked).toBe(true);
    await plan.saveShoppingList(toggled);
    expect((await plan.getShoppingList('2026-09-28'))?.items[0].checked).toBe(true);
    await plan.removeEntriesForRecipe(chicken.id);
    expect(await plan.entriesForDates(days)).toHaveLength(1);
  });
});
