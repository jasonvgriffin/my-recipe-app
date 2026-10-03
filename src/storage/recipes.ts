import { SEED_RECIPES } from '@/data/seed';
import { generateId } from '@/lib/recipe-utils';
import { isCategory, migrateRecipe, type Category, type Recipe } from '@/types/recipe';

import { createCollection, defaultStore, type KeyValueStore } from './kv';

export type { KeyValueStore } from './kv';

/** Key kept at v1 on purpose: records are upgraded in place by `migrateRecipe`. */
export const RECIPES_STORAGE_KEY = 'my-recipe-app/recipes/v1';
export const CATEGORIES_STORAGE_KEY = 'my-recipe-app/categories/v1';
const SEEDED_KEY = 'my-recipe-app/seeded/v1';

/** Recipe + category repository backed by a key-value store (AsyncStorage by default). */
export function createRecipeStore(store: KeyValueStore = defaultStore) {
  const recipes = createCollection<Recipe>(store, RECIPES_STORAGE_KEY, migrateRecipe);
  const categories = createCollection<Category>(store, CATEGORIES_STORAGE_KEY, (v) => (isCategory(v) ? v : undefined));

  return {
    /** Insert sample recipes once, on first launch. */
    async seedIfNeeded(seed: Recipe[] = SEED_RECIPES): Promise<void> {
      if (await store.getItem(SEEDED_KEY)) return;
      const existing = await recipes.all();
      const ids = new Set(existing.map((r) => r.id));
      await recipes.replaceAll([...existing, ...seed.filter((r) => !ids.has(r.id))]);
      await store.setItem(SEEDED_KEY, '1');
    },

    /** All recipes, newest first. */
    async list(): Promise<Recipe[]> {
      return (await recipes.all()).sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title),
      );
    },
    get: recipes.get,
    save: recipes.save,
    async remove(id: string): Promise<void> {
      await recipes.remove(id);
    },

    /** Distinct tags across all recipes, sorted. */
    async listTags(): Promise<string[]> {
      return [...new Set((await recipes.all()).flatMap((r) => r.tags))].sort();
    },

    // ---- Categories (spec #3) ----
    async listCategories(): Promise<Category[]> {
      return (await categories.all()).sort((a, b) => a.name.localeCompare(b.name));
    },
    async addCategory(name: string, now: Date = new Date()): Promise<Category> {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Category name is required.');
      const existing = (await categories.all()).find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) return existing;
      const category: Category = { id: generateId(), name: trimmed, createdAt: now.toISOString() };
      await categories.save(category);
      return category;
    },
    async renameCategory(id: string, name: string): Promise<void> {
      const c = await categories.get(id);
      if (c && name.trim()) await categories.save({ ...c, name: name.trim() });
    },
    /** Deletes the category and unassigns it from every recipe. */
    async removeCategory(id: string): Promise<void> {
      await categories.remove(id);
      const all = await recipes.all();
      await recipes.replaceAll(all.map((r) => ({ ...r, categoryIds: r.categoryIds.filter((c) => c !== id) })));
    },
  };
}

export type RecipeStore = ReturnType<typeof createRecipeStore>;

/** App-wide default store. */
export const recipeStore = createRecipeStore();
