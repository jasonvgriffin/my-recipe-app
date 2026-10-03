import { RECIPE_SCHEMA_VERSION, netCarbs, type Ingredient, type Recipe, type RecipeInput, type Step } from '@/types/recipe';

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

export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
export function createRecipe(input: RecipeInput, now: Date = new Date(), id: string = generateId()): Recipe {
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
    nutrition: { ...input.nutrition },
    rating: input.rating,
    unitSystem: input.unitSystem,
    categoryIds: [...new Set(input.categoryIds ?? [])],
    photoUri: input.photoUri || undefined,
    sourceUrl: input.sourceUrl?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    cooked: false,
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Keyword search (spec #8): case-insensitive over title, tags, ingredients, steps and notes. */
export function searchRecipes(recipes: Recipe[], query: string): Recipe[] {
  const q = query.trim().toLowerCase();
  if (!q) return recipes;
  return recipes.filter(
    (r) =>
      r.title.toLowerCase().includes(q) ||
      r.tags.some((t) => t.includes(q)) ||
      r.ingredients.some((i) => i.text.toLowerCase().includes(q)) ||
      r.steps.some((st) => st.text.toLowerCase().includes(q)) ||
      (r.notes ?? '').toLowerCase().includes(q),
  );
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

export type RecipeSort = 'newest' | 'title' | 'rating' | 'netCarbs' | 'lastCooked';

/** Sort recipes (spec #22 rating sort etc.). Unknown values sort last. */
export function sortRecipes(recipes: Recipe[], sort: RecipeSort): Recipe[] {
  const out = [...recipes];
  const last = (v: number | undefined, dir: 1 | -1) => (v === undefined ? Infinity : dir * v);
  switch (sort) {
    case 'title':
      return out.sort((a, b) => a.title.localeCompare(b.title));
    case 'rating':
      return out.sort((a, b) => last(a.rating, -1) - last(b.rating, -1) || a.title.localeCompare(b.title));
    case 'netCarbs':
      return out.sort((a, b) => last(netCarbs(a.nutrition), 1) - last(netCarbs(b.nutrition), 1));
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

/** Toggle cooked state (spec #10). Marking cooked records the date. */
export function setCooked(recipe: Recipe, cooked: boolean, now: Date = new Date()): Recipe {
  const ts = now.toISOString();
  return { ...recipe, cooked, lastCookedAt: cooked ? ts : recipe.lastCookedAt, updatedAt: ts };
}
