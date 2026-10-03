import { SEED_RECIPES } from '@/data/seed';
import { generateId } from '@/lib/recipe-utils';
import { isCategory, migrateRecipe, withSyncDefaults, type Category, type Recipe } from '@/types/recipe';

import { createCollection, defaultStore, type KeyValueStore } from './kv';

export type { KeyValueStore } from './kv';

/** Key kept at v1 on purpose: records are upgraded in place by `migrateRecipe`. */
export const RECIPES_STORAGE_KEY = 'my-recipe-app/recipes/v1';
export const CATEGORIES_STORAGE_KEY = 'my-recipe-app/categories/v1';
const SEEDED_KEY = 'my-recipe-app/seeded/v1';

/** Recipe + category repository backed by a key-value store (AsyncStorage by default). */
export function createRecipeStore(store: KeyValueStore = defaultStore) {
  const recipes = createCollection<Recipe>(store, RECIPES_STORAGE_KEY, migrateRecipe);
  const categories = createCollection<Category>(store, CATEGORIES_STORAGE_KEY, (v) =>
    isCategory(v) ? withSyncDefaults(v) : undefined,
  );
  let seeding: Promise<void> | undefined;

  return {
    /**
     * Insert sample recipes once, on first launch. Each device gets fresh UUIDs so seeds never collide
     * across households when synced (spec #25).
     */
    seedIfNeeded(seed: Recipe[] = SEED_RECIPES, now: Date = new Date()): Promise<void> {
      // Coalesce overlapping calls: each save fires a data-change event, and screens that reload on
      // that event call this again while the first seed is still writing (which used to duplicate samples).
      if (!seeding) {
        seeding = (async () => {
          if (await store.getItem(SEEDED_KEY)) return;
          for (const r of seed) await recipes.save({ ...r, id: generateId() }, now);
          await store.setItem(SEEDED_KEY, '1');
        })().finally(() => {
          seeding = undefined;
        });
      }
      return seeding;
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
    /** For the sync engine. */
    collections: { recipes, categories },

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
      const ts = now.toISOString();
      return categories.save({ id: generateId(), name: trimmed, createdAt: ts, updatedAt: ts }, now);
    },
    async renameCategory(id: string, name: string): Promise<void> {
      const c = await categories.get(id);
      if (c && name.trim()) await categories.save({ ...c, name: name.trim() });
    },
    /** Deletes the category and unassigns it from every recipe. */
    async removeCategory(id: string): Promise<void> {
      await categories.remove(id);
      for (const r of await recipes.all())
        if (r.categoryIds.includes(id))
          await recipes.save({ ...r, categoryIds: r.categoryIds.filter((c) => c !== id) });
    },

    /** Rename a tag on every recipe that has it (spec #20). Case-insensitive; dedupes. */
    async renameTag(from: string, to: string, now?: Date): Promise<void> {
      const f = from.trim().toLowerCase();
      const t = to.trim().toLowerCase();
      if (!f || !t || f === t) return;
      for (const r of await recipes.all()) {
        if (!r.tags.includes(f)) continue;
        const tags = [...new Set(r.tags.map((x) => (x === f ? t : x)))];
        await recipes.save({ ...r, tags }, now);
      }
    },

    /** Remove a tag from every recipe (spec #20). */
    async deleteTag(tag: string, now?: Date): Promise<void> {
      const f = tag.trim().toLowerCase();
      if (!f) return;
      for (const r of await recipes.all()) {
        if (!r.tags.includes(f)) continue;
        await recipes.save({ ...r, tags: r.tags.filter((x) => x !== f) }, now);
      }
    },
  };
}

export type RecipeStore = ReturnType<typeof createRecipeStore>;

/** App-wide default store. */
export const recipeStore = createRecipeStore();
