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
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Simple case-insensitive search over title, tags and ingredients. */
export function searchRecipes(recipes: Recipe[], query: string): Recipe[] {
  const q = query.trim().toLowerCase();
  if (!q) return recipes;
  return recipes.filter(
    (r) =>
      r.title.toLowerCase().includes(q) ||
      r.tags.some((t) => t.includes(q)) ||
      r.ingredients.some((i) => i.text.toLowerCase().includes(q)),
  );
}
