import { RECIPE_SCHEMA_VERSION, type Recipe, type RecipeInput } from '@/types/recipe';

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

/** Build a full Recipe from user input, normalizing whitespace and tags. */
export function createRecipe(input: RecipeInput, now: Date = new Date(), id: string = generateId()): Recipe {
  const ts = now.toISOString();
  return {
    id,
    schemaVersion: RECIPE_SCHEMA_VERSION,
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    ingredients: input.ingredients.map((i) => ({ text: i.text.trim() })).filter((i) => i.text),
    steps: input.steps.map((s) => s.trim()).filter(Boolean),
    tags: [...new Set(input.tags.map((t) => t.trim().toLowerCase()).filter(Boolean))],
    servings: input.servings,
    carbsPerServing: input.carbsPerServing,
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
      r.steps.some((s) => s.toLowerCase().includes(q)) ||
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
  return out;
}

/** Toggle cooked state (spec #10). Marking cooked records the date. */
export function setCooked(recipe: Recipe, cooked: boolean, now: Date = new Date()): Recipe {
  const ts = now.toISOString();
  return { ...recipe, cooked, lastCookedAt: cooked ? ts : recipe.lastCookedAt, updatedAt: ts };
}
