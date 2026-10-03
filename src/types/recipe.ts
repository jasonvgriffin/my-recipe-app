/**
 * Recipe schema for My Recipe App.
 *
 * This is the single source of truth for the recipe shape. It is used by the
 * app's local storage, the add-recipe form, and (later) JSON export/import and
 * the remote MCP server. Keep it JSON-serializable (no Dates, functions, etc.).
 */

/** Current schema version. Bump when the stored shape changes and add a migration. */
export const RECIPE_SCHEMA_VERSION = 1;

export interface Ingredient {
  /** Free-text line, e.g. "2 tbsp allulose" or "1 lb chicken thighs". */
  text: string;
}

export interface Recipe {
  /** Stable unique id (string so it can be shared across devices / servers). */
  id: string;
  schemaVersion: number;
  title: string;
  description?: string;
  ingredients: Ingredient[];
  /** Ordered instructions, one entry per step. */
  steps: string[];
  /** Lower-case tags, e.g. ["low-carb", "dinner"]. */
  tags: string[];
  /** Number of servings the recipe makes (> 0). */
  servings: number;
  /** Net carbs per serving in grams (>= 0). */
  carbsPerServing: number;
  /** ISO-8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}

/** Fields a user (or an AI assistant) supplies when creating a recipe. */
export type RecipeInput = Pick<
  Recipe,
  'title' | 'ingredients' | 'steps' | 'tags' | 'servings' | 'carbsPerServing'
> & { description?: string };

/** Jason's sweetener rule: allulose is the only sugar-free sweetener used. */
export const PREFERRED_SWEETENER = 'allulose';

/** Ingredients that must never appear in a recipe (no monk fruit, ever). */
export const FORBIDDEN_INGREDIENT_PATTERNS: readonly RegExp[] = [
  /monk\s*-?\s*fruit/i,
  /luo\s*han\s*guo/i,
  /mogroside/i,
];

/** Carbs-per-serving threshold (grams) under which a recipe is labeled low-carb. */
export const LOW_CARB_THRESHOLD_G = 15;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function findForbiddenIngredients(input: Pick<RecipeInput, 'ingredients' | 'steps' | 'title'>): string[] {
  const haystack = [input.title, ...input.ingredients.map((i) => i.text), ...input.steps];
  const hits = new Set<string>();
  for (const text of haystack) {
    for (const pattern of FORBIDDEN_INGREDIENT_PATTERNS) {
      const m = text.match(pattern);
      if (m) hits.add(m[0].toLowerCase());
    }
  }
  return [...hits];
}

export function validateRecipeInput(input: RecipeInput): ValidationResult {
  const errors: string[] = [];
  if (!input.title || !input.title.trim()) errors.push('Title is required.');
  if (input.ingredients.filter((i) => i.text.trim()).length === 0)
    errors.push('At least one ingredient is required.');
  if (input.steps.filter((s) => s.trim()).length === 0) errors.push('At least one step is required.');
  if (!Number.isFinite(input.servings) || input.servings <= 0)
    errors.push('Servings must be a number greater than 0.');
  if (!Number.isFinite(input.carbsPerServing) || input.carbsPerServing < 0)
    errors.push('Carbs per serving must be a number of 0 or more.');
  const forbidden = findForbiddenIngredients(input);
  if (forbidden.length > 0)
    errors.push(
      `Forbidden sweetener found (${forbidden.join(', ')}). Use ${PREFERRED_SWEETENER} as the only sugar-free sweetener.`,
    );
  return { ok: errors.length === 0, errors };
}

export function isLowCarb(recipe: Pick<Recipe, 'carbsPerServing'>): boolean {
  return recipe.carbsPerServing <= LOW_CARB_THRESHOLD_G;
}

/** Runtime type guard, used when loading stored or imported JSON. */
export function isRecipe(value: unknown): value is Recipe {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.title === 'string' &&
    Array.isArray(r.ingredients) &&
    r.ingredients.every((i) => typeof i === 'object' && i !== null && typeof (i as Ingredient).text === 'string') &&
    Array.isArray(r.steps) &&
    r.steps.every((s) => typeof s === 'string') &&
    Array.isArray(r.tags) &&
    r.tags.every((t) => typeof t === 'string') &&
    typeof r.servings === 'number' &&
    typeof r.carbsPerServing === 'number' &&
    typeof r.createdAt === 'string' &&
    typeof r.updatedAt === 'string'
  );
}
