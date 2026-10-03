import AsyncStorage from '@react-native-async-storage/async-storage';

import { SEED_RECIPES } from '@/data/seed';
import { isRecipe, type Recipe } from '@/types/recipe';

export const RECIPES_STORAGE_KEY = 'my-recipe-app/recipes/v1';
const SEEDED_KEY = 'my-recipe-app/seeded/v1';

/** Minimal key-value interface so storage can be swapped (tests, SQLite, sync backend). */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Recipe repository backed by a key-value store (AsyncStorage by default). */
export function createRecipeStore(store: KeyValueStore = AsyncStorage) {
  async function readAll(): Promise<Recipe[]> {
    const raw = await store.getItem(RECIPES_STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isRecipe) : [];
    } catch {
      return [];
    }
  }

  async function writeAll(recipes: Recipe[]): Promise<void> {
    await store.setItem(RECIPES_STORAGE_KEY, JSON.stringify(recipes));
  }

  return {
    /** Insert sample recipes once, on first launch. */
    async seedIfNeeded(seed: Recipe[] = SEED_RECIPES): Promise<void> {
      if (await store.getItem(SEEDED_KEY)) return;
      const existing = await readAll();
      const ids = new Set(existing.map((r) => r.id));
      await writeAll([...existing, ...seed.filter((r) => !ids.has(r.id))]);
      await store.setItem(SEEDED_KEY, '1');
    },

    /** All recipes, newest first. */
    async list(): Promise<Recipe[]> {
      const all = await readAll();
      return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title));
    },

    async get(id: string): Promise<Recipe | undefined> {
      return (await readAll()).find((r) => r.id === id);
    },

    /** Insert or replace a recipe by id. */
    async save(recipe: Recipe): Promise<void> {
      const all = await readAll();
      const idx = all.findIndex((r) => r.id === recipe.id);
      if (idx >= 0) all[idx] = recipe;
      else all.push(recipe);
      await writeAll(all);
    },

    async remove(id: string): Promise<void> {
      await writeAll((await readAll()).filter((r) => r.id !== id));
    },

    /** Distinct tags across all recipes, sorted. */
    async listTags(): Promise<string[]> {
      return [...new Set((await readAll()).flatMap((r) => r.tags))].sort();
    },
  };
}

export type RecipeStore = ReturnType<typeof createRecipeStore>;

/** App-wide default store. */
export const recipeStore = createRecipeStore();
