import { uuid } from '@/lib/ids';
import { sortCategories } from '@/lib/recipe-utils';
import {
  DEFAULT_CATEGORY_NAMES,
  isCategory,
  migrateRecipe,
  withSyncDefaults,
  type Category,
  type Recipe,
} from '@/types/recipe';

import { createCollection, defaultStore, type KeyValueStore } from './kv';
import { isUntouchedLegacySample } from './legacy-samples';

export type { KeyValueStore } from './kv';

/** Key kept at v1 on purpose: records are upgraded in place by `migrateRecipe`. */
export const RECIPES_STORAGE_KEY = 'my-recipe-app/recipes/v1';
export const CATEGORIES_STORAGE_KEY = 'my-recipe-app/categories/v1';
/** Set once untouched v1.0.0 sample recipes have been removed (see `legacy-samples.ts`). */
const SAMPLES_REMOVED_KEY = 'my-recipe-app/samples-removed/v1';
/** Set once the default categories (Breakfast, Lunch, Dinner) were offered on this device (v1.0.5). */
export const DEFAULT_CATEGORIES_SEEDED_KEY = 'my-recipe-app/default-categories-seeded/v1';

/** Thrown by `renameCategory` / `addCategory({ unique })` when another category already has that name. */
export class DuplicateCategoryError extends Error {
  constructor(name: string) {
    super(`A category named “${name}” already exists.`);
    this.name = 'DuplicateCategoryError';
  }
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Recipe + category repository backed by a key-value store (AsyncStorage by default). */
export function createRecipeStore(store: KeyValueStore = defaultStore) {
  const recipes = createCollection<Recipe>(store, RECIPES_STORAGE_KEY, migrateRecipe);
  const categories = createCollection<Category>(store, CATEGORIES_STORAGE_KEY, (v) =>
    isCategory(v) ? withSyncDefaults(v) : undefined,
  );
  let cleaning: Promise<number> | undefined;
  let preparing: Promise<void> | undefined;

  async function nextSortOrder(): Promise<number> {
    const orders = (await categories.all()).map((c) => c.sortOrder).filter((n): n is number => typeof n === 'number');
    return orders.length ? Math.max(...orders) + 1 : 0;
  }

  /**
   * Sync can bring two categories with the same name (e.g. each phone seeded “Breakfast” before
   * joining). Keep the oldest (then lowest id — every device picks the same one), move recipes onto it and
   * tombstone the rest. Returns how many were merged away.
   */
  async function mergeDuplicateCategories(now: Date = new Date()): Promise<number> {
    const live = await categories.all();
    const byName = new Map<string, Category[]>();
    for (const c of live) {
      const key = c.name.trim().toLowerCase();
      byName.set(key, [...(byName.get(key) ?? []), c]);
    }
    const remap = new Map<string, string>();
    for (const group of byName.values()) {
      if (group.length < 2) continue;
      const [keep, ...drop] = [...group].sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
      for (const d of drop) remap.set(d.id, keep.id);
    }
    if (remap.size === 0) return 0;
    for (const r of await recipes.all()) {
      if (!r.categoryIds.some((id) => remap.has(id))) continue;
      const categoryIds = [...new Set(r.categoryIds.map((id) => remap.get(id) ?? id))];
      await recipes.save({ ...r, categoryIds }, now);
    }
    for (const id of remap.keys()) await categories.remove(id, now);
    return remap.size;
  }

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

    // ---- Categories (spec #3; v1.0.5 the Recipes tab groups by them) ----
    /** Categories in display order (`sortOrder`, then name). */
    async listCategories(): Promise<Category[]> {
      return sortCategories(await categories.all());
    },
    /**
     * Add a category (deduped by name, case-insensitive: returns the existing one). New ones go last.
     * `unique: true` throws `DuplicateCategoryError` instead of returning an existing match.
     */
    async addCategory(name: string, now: Date = new Date(), opts: { unique?: boolean } = {}): Promise<Category> {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Category name is required.');
      const existing = (await categories.all()).find((c) => sameName(c.name, trimmed));
      if (existing) {
        if (opts.unique) throw new DuplicateCategoryError(existing.name);
        return existing;
      }
      const ts = now.toISOString();
      return categories.save(
        { id: uuid(), name: trimmed, sortOrder: await nextSortOrder(), createdAt: ts, updatedAt: ts },
        now,
      );
    },
    /** Rename; throws `DuplicateCategoryError` if another category already has the name. */
    async renameCategory(id: string, name: string, now: Date = new Date()): Promise<void> {
      const trimmed = name.trim();
      const c = await categories.get(id);
      if (!c || !trimmed || c.name === trimmed) return;
      const clash = (await categories.all()).find((o) => o.id !== id && sameName(o.name, trimmed));
      if (clash) throw new DuplicateCategoryError(clash.name);
      await categories.save({ ...c, name: trimmed }, now);
    },
    /** How many (live) recipes are in the category. */
    async countInCategory(id: string): Promise<number> {
      return (await recipes.all()).filter((r) => r.categoryIds.includes(id)).length;
    },
    /** Deletes the category; its recipes move to Uncategorized (the id is unassigned from every recipe). */
    async removeCategory(id: string, now: Date = new Date()): Promise<void> {
      await categories.remove(id, now);
      for (const r of await recipes.all())
        if (r.categoryIds.includes(id))
          await recipes.save({ ...r, categoryIds: r.categoryIds.filter((c) => c !== id) }, now);
    },
    mergeDuplicateCategories,
    /**
     * Recipes tab start-up (v1.0.5): once per device, add the default categories (Breakfast, Lunch, Dinner) that
     * don't exist yet — a category the user deletes later stays deleted. Every call also merges same-name
     * duplicates that sync may have brought in. Coalesced across overlapping reloads.
     */
    prepareCategories(now: Date = new Date()): Promise<void> {
      if (!preparing) {
        preparing = (async () => {
          if (!(await store.getItem(DEFAULT_CATEGORIES_SEEDED_KEY))) {
            const existing = await categories.all();
            let order = await nextSortOrder();
            for (const [i, name] of DEFAULT_CATEGORY_NAMES.entries()) {
              if (existing.some((c) => sameName(c.name, name))) continue;
              // Fresh installs get 0, 1, 2; existing category lists keep their order and the defaults follow.
              const sortOrder = existing.length === 0 ? i : order++;
              const ts = now.toISOString();
              await categories.save({ id: uuid(), name, sortOrder, createdAt: ts, updatedAt: ts }, now);
            }
            await store.setItem(DEFAULT_CATEGORIES_SEEDED_KEY, '1');
          }
          await mergeDuplicateCategories(now);
        })().finally(() => {
          preparing = undefined;
        });
      }
      return preparing;
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
