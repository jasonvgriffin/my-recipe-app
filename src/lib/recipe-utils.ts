import {
  RECIPE_SCHEMA_VERSION,
  type Ingredient,
  type Recipe,
  type RecipeInput,
  type Step,
} from '@/types/recipe';

import { uuid } from './ids';
import { parseIngredient } from './ingredients';
import { detectStepDuration } from './timers';

/** Split multi-line text into trimmed, non-empty lines. */
export function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Split comma/newline separated tags, lower-case and de-duplicate them. */
export function parseTags(text: string): string[] {
  const tags = text
    .split(/[,\n]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(tags)];
}

/** Trim + parse quantity/unit/name if the ingredient hasn't been parsed yet. */
export function normalizeIngredient(i: Ingredient): Ingredient {
  const text = i.text.trim();
  const parsed = i.quantity === undefined && i.name === undefined ? parseIngredient(text) : {};
  return { ...parsed, ...i, text };
}

/** Trim + detect a timer duration if none set (spec #15). */
export function normalizeStep(st: Step | string): Step {
  const text = (typeof st === 'string' ? st : st.text).trim();
  const given = typeof st === 'string' ? undefined : st.durationSeconds;
  const durationSeconds = given ?? detectStepDuration(text);
  return durationSeconds ? { text, durationSeconds } : { text };
}

/** Build a full Recipe from user input, normalizing whitespace and tags. */
export function createRecipe(input: RecipeInput, now: Date = new Date(), id: string = uuid()): Recipe {
  const ts = now.toISOString();
  return {
    id,
    schemaVersion: RECIPE_SCHEMA_VERSION,
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    ingredients: input.ingredients.map(normalizeIngredient).filter((i) => i.text),
    steps: input.steps.map(normalizeStep).filter((st) => st.text),
    tags: [...new Set(input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))],
    servings: input.servings,
    rating: input.rating,
    unitSystem: input.unitSystem,
    categoryIds: [...new Set(input.categoryIds ?? [])],
    photoUri: input.photoUri || undefined,
    sourceUrl: input.sourceUrl?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    cooked: false,
    cookHistory: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Keyword search (spec #8): case-insensitive over title, ingredients, notes, tags, and steps. */
export function searchRecipes(recipes: Recipe[], query: string): Recipe[] {
  const q = query.trim().toLowerCase();
  if (!q) return recipes;
  return recipes.filter((r) => {
    const ingredients = r.ingredients
      .map((i) => [i.text, i.name ?? '', i.note ?? '', i.substitutionNote ?? ''].join(' '))
      .join('\n');
    return (
      r.title.toLowerCase().includes(q) ||
      r.tags.some((t) => t.includes(q)) ||
      ingredients.toLowerCase().includes(q) ||
      (r.notes ?? '').toLowerCase().includes(q) ||
      (r.description ?? '').toLowerCase().includes(q) ||
      r.steps.some((st) => st.text.toLowerCase().includes(q))
    );
  });
}

export interface RecipeFilter {
  keyword?: string;
  /** true = only cooked, false = only never cooked, undefined = all. */
  cooked?: boolean;
  /** Only recipes cooked within the last N days (spec #9 "cooked recently"). */
  cookedWithinDays?: number;
  /** Only recipes in this category (spec #3). */
  categoryId?: string;
  /** Only recipes having ALL these tags (spec #20). */
  tags?: string[];
  /** Only recipes rated at least this many stars (spec #22). */
  minRating?: number;
}

export type RecipeSort = 'newest' | 'title' | 'rating' | 'lastCooked';

/** Sort recipes (spec #22 rating sort etc.). Unknown values sort last. */
export function sortRecipes(recipes: Recipe[], sort: RecipeSort): Recipe[] {
  const out = [...recipes];
  const last = (v: number | undefined, dir: 1 | -1) => (v === undefined ? Infinity : dir * v);
  switch (sort) {
    case 'title':
      return out.sort((a, b) => a.title.localeCompare(b.title));
    case 'rating':
      return out.sort((a, b) => last(a.rating, -1) - last(b.rating, -1) || a.title.localeCompare(b.title));
    case 'lastCooked':
      return out.sort((a, b) => (b.lastCookedAt ?? '').localeCompare(a.lastCookedAt ?? ''));
    default:
      return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

/** Apply list filters (spec #9). */
export function filterRecipes(recipes: Recipe[], filter: RecipeFilter, now: Date = new Date()): Recipe[] {
  let out = filter.keyword ? searchRecipes(recipes, filter.keyword) : recipes;
  if (filter.cooked !== undefined) out = out.filter((r) => r.cooked === filter.cooked);
  if (filter.cookedWithinDays !== undefined) {
    const cutoff = now.getTime() - filter.cookedWithinDays * 86_400_000;
    out = out.filter((r) => r.lastCookedAt !== undefined && Date.parse(r.lastCookedAt) >= cutoff);
  }
  if (filter.categoryId) out = out.filter((r) => r.categoryIds.includes(filter.categoryId!));
  if (filter.tags?.length) out = out.filter((r) => filter.tags!.every((t) => r.tags.includes(t.toLowerCase())));
  if (filter.minRating !== undefined) out = out.filter((r) => (r.rating ?? 0) >= filter.minRating!);
  return out;
}

/** Set or clear a 1–5 star rating (spec #22). */
export function setRating(recipe: Recipe, rating: number | undefined, now: Date = new Date()): Recipe {
  const r = rating === undefined ? undefined : Math.min(5, Math.max(1, Math.round(rating)));
  return { ...recipe, rating: r, updatedAt: now.toISOString() };
}

/**
 * Cooked toggle (spec #10). Marking cooked appends `now` to `cookHistory` and sets `lastCookedAt`.
 * Clearing cooked keeps the date and the history.
 */
export function setCooked(recipe: Recipe, cooked: boolean, now: Date = new Date()): Recipe {
  const ts = now.toISOString();
  if (!cooked) return { ...recipe, cooked: false, updatedAt: ts };
  return {
    ...recipe,
    cooked: true,
    lastCookedAt: ts,
    cookHistory: [...(recipe.cookHistory ?? []), ts],
    updatedAt: ts,
  };
}

/** Add comma- or newline-separated tags (spec #20). No-op when nothing new. */
export function addRecipeTags(recipe: Recipe, text: string, now: Date = new Date()): Recipe {
  const next = parseTags(text).filter((t) => !recipe.tags.includes(t));
  if (next.length === 0) return recipe;
  return { ...recipe, tags: [...recipe.tags, ...next], updatedAt: now.toISOString() };
}

/** Remove one tag from a recipe (spec #20). */
export function removeRecipeTag(recipe: Recipe, tag: string, now: Date = new Date()): Recipe {
  const t = tag.trim().toLowerCase();
  if (!recipe.tags.includes(t)) return recipe;
  return { ...recipe, tags: recipe.tags.filter((x) => x !== t), updatedAt: now.toISOString() };
}

/** Assign or unassign a single category (spec #3). */
export function toggleRecipeCategory(recipe: Recipe, categoryId: string, now: Date = new Date()): Recipe {
  const has = recipe.categoryIds.includes(categoryId);
  const categoryIds = has ? recipe.categoryIds.filter((id) => id !== categoryId) : [...recipe.categoryIds, categoryId];
  return { ...recipe, categoryIds, updatedAt: now.toISOString() };
}

/** List browse state for the Recipes tab (spec #8, #9, #20, #22). */
export interface RecipeBrowse {
  keyword: string;
  /** true = cooked, false = never cooked, undefined = either. */
  cooked?: boolean;
  /** Cooked within the user's "cooked recently" window. */
  recent: boolean;
  categoryId?: string;
  /** Recipes must have every selected tag. */
  tags: string[];
  minRating?: number;
  sort: RecipeSort;
}

export const DEFAULT_BROWSE: RecipeBrowse = {
  keyword: '',
  recent: false,
  tags: [],
  sort: 'newest',
};

/** Map browse controls onto `filterRecipes`, dropping facets whose feature gate is closed. */
export function browseFilters(
  browse: RecipeBrowse,
  opts: { recentDays: number; categories: boolean; tags: boolean; ratings: boolean },
): RecipeFilter {
  const days = Number.isFinite(opts.recentDays) ? Math.min(365, Math.max(1, Math.round(opts.recentDays))) : 14;
  return {
    keyword: browse.keyword.trim() ? browse.keyword : undefined,
    cooked: browse.cooked,
    cookedWithinDays: browse.recent ? days : undefined,
    categoryId: opts.categories ? browse.categoryId : undefined,
    tags: opts.tags && browse.tags.length ? browse.tags : undefined,
    minRating: opts.ratings ? browse.minRating : undefined,
  };
}

/** True when any list filter (not sort) is narrowing results. */
export function isBrowseFiltered(browse: RecipeBrowse): boolean {
  return Boolean(
    browse.keyword.trim() ||
    browse.cooked !== undefined ||
    browse.recent ||
    browse.categoryId ||
    browse.tags.length ||
    browse.minRating !== undefined,
  );
}

/** Rating sort is hidden when ratings are unavailable; fall back to newest. */
export function effectiveRecipeSort(sort: RecipeSort, ratingsAvailable: boolean): RecipeSort {
  return !ratingsAvailable && sort === 'rating' ? 'newest' : sort;
}
