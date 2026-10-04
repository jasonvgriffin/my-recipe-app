/**
 * v1.0.5 recipe categories (spec #3): default Breakfast / Lunch / Dinner, ordering, one category per recipe,
 * duplicate merging after sync, grouping for the Recipes tab, Advanced search state, imports default
 * to Uncategorized.
 */
import { SAMPLE_RECIPES } from '../test-helpers/sample-recipes';
import { importRecipe, type ImportDeps } from '@/import';
import { ADD_MENU_ITEMS } from '@/lib/add-menu';
import {
  DEFAULT_BROWSE,
  groupRecipesByCategory,
  isAdvancedSearchActive,
  primaryCategoryId,
  resetAdvancedSearch,
  setRecipeCategory,
  sortCategories,
} from '@/lib/recipe-utils';
import { createRecipeStore, DuplicateCategoryError, type KeyValueStore } from '@/storage/recipes';
import { isCategory, type Category } from '@/types/recipe';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

const [chicken, mousse] = SAMPLE_RECIPES;
const T0 = new Date('2026-10-01T12:00:00Z');
const T1 = new Date('2026-10-02T12:00:00Z');
const cat = (id: string, name: string, sortOrder?: number, createdAt = T0.toISOString()): Category => ({
  id,
  name,
  sortOrder,
  createdAt,
  updatedAt: createdAt,
});

describe('default categories', () => {
  it('seeds Breakfast, Lunch, Dinner once per device, in that order', async () => {
    const store = createRecipeStore(memoryStore());
    await store.prepareCategories(T0);
    expect((await store.listCategories()).map((c) => [c.name, c.sortOrder])).toEqual([
      ['Breakfast', 0],
      ['Lunch', 1],
      ['Dinner', 2],
    ]);
    // A deleted default stays deleted (seeded once).
    const lunch = (await store.listCategories()).find((c) => c.name === 'Lunch')!;
    await store.removeCategory(lunch.id);
    await store.prepareCategories(T1);
    expect((await store.listCategories()).map((c) => c.name)).toEqual(['Breakfast', 'Dinner']);
  });

  it('keeps existing categories first and adds only the missing defaults after them', async () => {
    const store = createRecipeStore(memoryStore());
    await store.addCategory('Breads', T0);
    await store.addCategory('dinner', T0);
    await Promise.all([store.prepareCategories(T1), store.prepareCategories(T1)]); // coalesced
    expect((await store.listCategories()).map((c) => c.name)).toEqual(['Breads', 'dinner', 'Breakfast', 'Lunch']);
  });

  it('new categories go last; sortCategories puts unordered ones after, by name', async () => {
    const store = createRecipeStore(memoryStore());
    await store.prepareCategories(T0);
    await store.addCategory('Snacks');
    expect((await store.listCategories()).map((c) => c.name)).toEqual(['Breakfast', 'Lunch', 'Dinner', 'Snacks']);
    expect(sortCategories([cat('a', 'Zeta'), cat('b', 'Alpha'), cat('c', 'Mid', 0)]).map((c) => c.name)).toEqual([
      'Mid',
      'Alpha',
      'Zeta',
    ]);
    expect(isCategory(cat('x', 'X', 3))).toBe(true);
    expect(isCategory({ ...cat('x', 'X'), sortOrder: 'first' })).toBe(false);
  });
});

describe('rename / add / delete', () => {
  it('rejects a rename or a unique add that clashes with another category (case-insensitive)', async () => {
    const store = createRecipeStore(memoryStore());
    await store.prepareCategories(T0);
    const [breakfast] = await store.listCategories();
    await expect(store.renameCategory(breakfast.id, ' lunch ')).rejects.toBeInstanceOf(DuplicateCategoryError);
    await expect(store.addCategory('DINNER', T1, { unique: true })).rejects.toBeInstanceOf(DuplicateCategoryError);
    await store.renameCategory(breakfast.id, 'Brunch');
    expect((await store.listCategories())[0]).toMatchObject({ id: breakfast.id, name: 'Brunch', sortOrder: 0 });
  });

  it('deleting a category moves its recipes to Uncategorized', async () => {
    const store = createRecipeStore(memoryStore());
    await store.prepareCategories(T0);
    const [breakfast] = await store.listCategories();
    await store.save({ ...chicken, categoryIds: [breakfast.id] });
    expect(await store.countInCategory(breakfast.id)).toBe(1);
    await store.removeCategory(breakfast.id);
    expect((await store.get(chicken.id))?.categoryIds).toEqual([]);
    const { uncategorized } = groupRecipesByCategory(await store.list(), await store.listCategories());
    expect(uncategorized.map((r) => r.id)).toEqual([chicken.id]);
  });
});

describe('sync duplicates', () => {
  it('merges same-name categories onto the oldest and moves recipes; every device picks the same one', async () => {
    const store = createRecipeStore(memoryStore());
    const older = cat('id-b', 'Breakfast', 0, '2026-09-01T00:00:00.000Z');
    const newer = cat('id-a', 'breakfast', 0, '2026-09-05T00:00:00.000Z');
    await store.collections.categories.save(older);
    await store.collections.categories.save(newer);
    await store.save({ ...chicken, categoryIds: [newer.id] });
    await store.save({ ...mousse, categoryIds: [older.id, newer.id] });
    expect(await store.mergeDuplicateCategories(T1)).toBe(1);
    expect((await store.listCategories()).map((c) => c.id)).toEqual([older.id]);
    expect((await store.get(chicken.id))?.categoryIds).toEqual([older.id]);
    expect((await store.get(mousse.id))?.categoryIds).toEqual([older.id]);
    expect(await store.mergeDuplicateCategories(T1)).toBe(0);
  });
});

describe('recipe helpers', () => {
  it('setRecipeCategory sets one category or none; primaryCategoryId ignores deleted ids', () => {
    const r = setRecipeCategory({ ...chicken, categoryIds: ['a', 'b'] }, 'c', T1);
    expect(r.categoryIds).toEqual(['c']);
    expect(r.updatedAt).toBe(T1.toISOString());
    expect(setRecipeCategory(r, undefined, T1).categoryIds).toEqual([]);
    expect(setRecipeCategory(r, 'c', T0)).toBe(r);
    expect(primaryCategoryId({ categoryIds: ['gone', 'c'] }, [{ id: 'c' }])).toBe('c');
    expect(primaryCategoryId({ categoryIds: ['gone'] }, [{ id: 'c' }])).toBeUndefined();
  });

  it('groups recipes by category (empty groups kept) with Uncategorized for the rest', () => {
    const cats = [cat('b', 'Breakfast', 0), cat('l', 'Lunch', 1)];
    const lone = { ...mousse, id: 'lone', categoryIds: ['deleted-id'] };
    const { groups, uncategorized } = groupRecipesByCategory(
      [{ ...chicken, categoryIds: ['b'] }, { ...mousse, categoryIds: [] }, lone],
      cats,
    );
    expect(groups.map((g) => [g.category.name, g.recipes.map((r) => r.id)])).toEqual([
      ['Breakfast', [chicken.id]],
      ['Lunch', []],
    ]);
    expect(uncategorized.map((r) => r.id)).toEqual([mousse.id, 'lone']);
  });

  it('Advanced search: active when any filter or the sort is non-default; reset keeps the keyword', () => {
    expect(isAdvancedSearchActive(DEFAULT_BROWSE)).toBe(false);
    expect(isAdvancedSearchActive({ ...DEFAULT_BROWSE, keyword: 'soup' })).toBe(false);
    expect(isAdvancedSearchActive({ ...DEFAULT_BROWSE, cooked: false })).toBe(true);
    expect(isAdvancedSearchActive({ ...DEFAULT_BROWSE, recent: true })).toBe(true);
    expect(isAdvancedSearchActive({ ...DEFAULT_BROWSE, minRating: 3 })).toBe(true);
    expect(isAdvancedSearchActive({ ...DEFAULT_BROWSE, tags: ['dinner'] })).toBe(true);
    expect(isAdvancedSearchActive({ ...DEFAULT_BROWSE, sort: 'title' })).toBe(true);
    expect(resetAdvancedSearch({ ...DEFAULT_BROWSE, keyword: 'soup', cooked: true, sort: 'rating', minRating: 4 })).toEqual({
      ...DEFAULT_BROWSE,
      keyword: 'soup',
    });
  });
});

describe('imports default to Uncategorized (v1.0.5)', () => {
  const PAGE = `<html><head><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: 'Almond Flour Bread',
    recipeIngredient: ['2 cups almond flour'],
    recipeInstructions: ['Bake 40 minutes'],
    recipeCategory: 'Main Course',
  })}</script></head></html>`;
  const deps = (store = createRecipeStore(memoryStore())): ImportDeps & { store: typeof store } => ({
    store,
    fetchHtml: jest.fn(async () => PAGE),
    now: () => T1,
  });

  it('a link import ignores the page category: no category created, recipe is Uncategorized', async () => {
    const d = deps();
    const result = await importRecipe({ kind: 'url', url: 'https://example.com/bread' }, {}, d);
    if (!result.ok) throw new Error(result.errors.join());
    expect(result.recipe.categoryIds).toEqual([]);
    expect(await d.store.listCategories()).toEqual([]);
  });

  it('a structured (assistant) import uses the first category it names', async () => {
    const d = deps();
    await d.store.prepareCategories(T0);
    const result = await importRecipe(
      {
        kind: 'structured',
        recipe: { title: 'Egg Cups', ingredients: ['6 eggs'], steps: ['Bake 20 min'], categories: ['breakfast', 'Lunch'] },
      },
      {},
      d,
    );
    if (!result.ok) throw new Error(result.errors.join());
    const breakfast = (await d.store.listCategories()).find((c) => c.name === 'Breakfast')!;
    expect(result.recipe.categoryIds).toEqual([breakfast.id]);
    expect(await d.store.listCategories()).toHaveLength(3);
  });

  it('re-importing (update) keeps the category the user chose', async () => {
    const d = deps();
    const first = await importRecipe({ kind: 'url', url: 'https://example.com/bread' }, {}, d);
    if (!first.ok) throw new Error('import failed');
    const mine = await d.store.addCategory('Breads');
    await d.store.save(setRecipeCategory(first.recipe, mine.id));
    const again = await importRecipe({ kind: 'url', url: 'https://example.com/bread' }, { onDuplicate: 'update' }, d);
    if (!again.ok) throw new Error('import failed');
    expect(again.recipe.categoryIds).toEqual([mine.id]);
  });
});

describe('+ menu labels (v1.0.5)', () => {
  it('the sheet never truncates labels (no numberOfLines / ellipsis on the label text)', () => {
    const src: string = jest.requireActual('fs').readFileSync('src/components/add-menu-sheet.tsx', 'utf8');
    expect(src).not.toMatch(/numberOfLines/);
    expect(src).not.toMatch(/ellipsizeMode/);
    expect(ADD_MENU_ITEMS.map((i) => i.label)).toContain('Add to Shopping List');
  });
});
