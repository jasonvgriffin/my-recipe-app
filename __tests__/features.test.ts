import { addSampleRecipes, SAMPLE_RECIPES } from '../test-helpers/sample-recipes';
import { startOfWeek, toIsoDate, weekDates } from '@/lib/dates';
import { filterRecipes, setCooked, setRating } from '@/lib/recipe-utils';
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
const [chicken, mousse] = SAMPLE_RECIPES;

describe('schema migration', () => {
  it('upgrades a v1 recipe (no categories / cooked fields)', () => {
    const { categoryIds, cooked, ...v1 } = chicken;
    void categoryIds;
    void cooked;
    const migrated = migrateRecipe({ ...v1, schemaVersion: 1 });
    expect(migrated).toMatchObject({ categoryIds: [], cooked: false, schemaVersion: RECIPE_SCHEMA_VERSION });
    expect(migrated?.cookHistory).toEqual([]);
  });

  it('seeds cook history from lastCookedAt when the field is missing (spec #10)', () => {
    const { cookHistory, ...rest } = chicken;
    void cookHistory;
    const migrated = migrateRecipe({ ...rest, cooked: true, lastCookedAt: '2026-08-01T00:00:00.000Z' });
    expect(migrated?.cookHistory).toEqual(['2026-08-01T00:00:00.000Z']);
    expect(migrated?.schemaVersion).toBe(RECIPE_SCHEMA_VERSION);
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
    expect(cookedLongAgo.cookHistory).toEqual(['2026-08-01T00:00:00.000Z']);
    const again = setCooked(cookedLongAgo, true, new Date('2026-09-01T00:00:00.000Z'));
    expect(again.cookHistory).toEqual(['2026-08-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z']);
    expect(again.lastCookedAt).toBe('2026-09-01T00:00:00.000Z');
    const uncooked = setCooked(again, false, NOW);
    expect(uncooked.cooked).toBe(false);
    expect(uncooked.lastCookedAt).toBe(again.lastCookedAt);
    expect(uncooked.cookHistory).toEqual(again.cookHistory);
  });

  it('combines keyword, cooked, recent window, category, tag and rating', () => {
    const match = {
      ...setRating(setCooked({ ...mousse, notes: 'weeknight treat' }, true, new Date('2026-10-01T00:00:00.000Z')), 5),
      categoryIds: ['desserts'],
    };
    const other = setRating(chicken, 2);
    const all = [match, other];
    expect(
      filterRecipes(
        all,
        {
          keyword: 'weeknight',
          cooked: true,
          cookedWithinDays: 14,
          categoryId: 'desserts',
          tags: ['dessert'],
          minRating: 4,
        },
        NOW,
      ).map((r) => r.id),
    ).toEqual([mousse.id]);
    expect(filterRecipes(all, {}, NOW)).toHaveLength(2);
  });
});

describe('categories (spec #3)', () => {
  it('adds (deduped), renames and removes categories, unassigning recipes', async () => {
    const store = createRecipeStore(memoryStore());
    await addSampleRecipes(store);
    const breads = await store.addCategory('Breads');
    expect((await store.addCategory(' breads ')).id).toBe(breads.id);
    await store.save({ ...chicken, categoryIds: [breads.id] });
    await store.renameCategory(breads.id, 'Breads & Rolls');
    expect((await store.listCategories()).map((c) => c.name)).toEqual(['Breads & Rolls']);
    await store.removeCategory(breads.id);
    expect((await store.get(chicken.id))?.categoryIds).toEqual([]);
  });
});

describe('tags (spec #20)', () => {
  it('renames and deletes a tag on every recipe that has it', async () => {
    const store = createRecipeStore(memoryStore());
    await store.save(chicken);
    await store.save(mousse);
    await store.renameTag('Diabetic-Friendly', 'family');
    expect((await store.get(chicken.id))?.tags).toContain('family');
    expect((await store.get(chicken.id))?.tags).not.toContain('diabetic-friendly');
    expect((await store.get(mousse.id))?.tags).toContain('family');
    expect((await store.get(mousse.id))?.tags).toContain('dessert');
    await store.deleteTag('family');
    expect((await store.get(chicken.id))?.tags).not.toContain('family');
    expect(await store.listTags()).not.toContain('family');
    expect(await store.listTags()).toContain('dessert');
  });
});

describe('meal plan + shopping list (spec #11, #12)', () => {
  it('computes week dates starting Monday', () => {
    const start = toIsoDate(startOfWeek(new Date(2026, 9, 2))); // Fri Oct 2 2026
    expect(start).toBe('2026-09-28');
    expect(weekDates(start)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
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
    const list = buildShoppingList('2026-09-28', days, entries, SAMPLE_RECIPES, NOW);
    expect(list.items).toHaveLength(chicken.ingredients.length + mousse.ingredients.length);
    const toggled = toggleItem(list, list.items[0].id, NOW);
    expect(toggled.items[0].checked).toBe(true);
    await plan.saveShoppingList(toggled);
    expect((await plan.getShoppingList('2026-09-28'))?.items[0].checked).toBe(true);
    await plan.removeEntriesForRecipe(chicken.id);
    expect(await plan.entriesForDates(days)).toHaveLength(1);
  });
});
