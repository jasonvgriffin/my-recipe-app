import { uuid } from '@/lib/ids';
import { isCategory, migrateRecipe, withSyncDefaults, type Category, type Recipe } from '@/types/recipe';

import { createCollection, defaultStore, type KeyValueStore } from './kv';
import { isUntouchedLegacySample } from './legacy-samples';

export type { KeyValueStore } from './kv';

/** Key kept at v1 on purpose: records are upgraded in place by `migrateRecipe`. */
export const RECIPES_STORAGE_KEY = 'my-recipe-app/recipes/v1';
export const CATEGORIES_STORAGE_KEY = 'my-recipe-app/categories/v1';
/** Set once untouched v1.0.0 sample recipes have been removed (see `legacy-samples.ts`). */
const SAMPLES_REMOVED_KEY = 'my-recipe-app/samples-removed/v1';

/** Recipe + category repository backed by a key-value store (AsyncStorage by default). */
export function createRecipeStore(store: KeyValueStore = defaultStore) {
  const recipes = createCollection<Recipe>(store, RECIPES_STORAGE_KEY, migrateRecipe);
  const categories = createCollection<Category>(store, CATEGORIES_STORAGE_KEY, (v) =>
    isCategory(v) ? withSyncDefaults(v) : undefined,
  );
  let cleaning: Promise<number> | undefined;

  return {
    /**
     * No sample recipes are seeded (v1.0.1). Old installs got two samples on first launch; delete them once,
     * only while untouched (`isUntouchedLegacySample`) — user recipes and edited samples are never removed.
     * Coalesced so overlapping screen reloads run it once. Returns how many were removed.
     */
    removeUntouchedSamples(now: Date = new Date()): Promise<number> {
      if (!cleaning) {
        cleaning = (async () => {
          if (await store.getItem(SAMPLES_REMOVED_KEY)) return 0;
          let removed = 0;
          for (const r of await recipes.all()) {
            if (!isUntouchedLegacySample(r)) continue;
            await recipes.remove(r.id, now);
            removed++;
          }
          await store.setItem(SAMPLES_REMOVED_KEY, '1');
          return removed;
        })().finally(() => {
          cleaning = undefined;
        });
      }
      return cleaning;
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
      return categories.save({ id: uuid(), name: trimmed, createdAt: ts, updatedAt: ts }, now);
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
