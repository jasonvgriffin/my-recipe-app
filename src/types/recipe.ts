/**
 * Recipe schema for My Recipe App.
 *
 * This is the single source of truth for the recipe shape. It is used by the
 * app's local storage, the add-recipe form, and (later) JSON export/import and
 * the remote MCP server. Keep it JSON-serializable (no Dates, functions, etc.).
 *
 * v1 feature spec: docs/SPEC.md. Fields marked (spec #N) map to items in that spec.
 */

/** Current schema version. Bump when the stored shape changes and add a migration. */
export const RECIPE_SCHEMA_VERSION = 2;

export interface Ingredient {
  /** Free-text line, e.g. "2 tbsp allulose" or "1 lb chicken thighs". */
  text: string;
  /** Optional note about a substitution made, e.g. "allulose instead of sugar" (spec #2). */
  substitutionNote?: string;
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
  /**
   * Net carbs per serving in grams (>= 0). Undefined = unknown (e.g. imported from a page without
   * nutrition info). Never default it to 0 — that would mislead a diabetic user.
   */
  carbsPerServing?: number;
  /** Ids of user-defined categories (spec #3). */
  categoryIds: string[];
  /** Local file URI of the optional recipe photo (spec #4). */
  photoUri?: string;
  /** Original web page the recipe was imported from; tappable in the UI (spec #1, #5). */
  sourceUrl?: string;
  /** Free-text personal notes (spec #6). */
  notes?: string;
  /** Has this recipe been cooked at least once (spec #10). */
  cooked: boolean;
  /** ISO-8601 timestamp of the most recent time it was cooked (spec #9, #10). */
  lastCookedAt?: string;
  /** ISO-8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}

/** Fields a user (or an AI assistant) supplies when creating a recipe. */
export type RecipeInput = Pick<
  Recipe,
  'title' | 'ingredients' | 'steps' | 'tags' | 'servings'
> &
  Partial<Pick<Recipe, 'carbsPerServing'>> &
  Partial<Pick<Recipe, 'description' | 'categoryIds' | 'photoUri' | 'sourceUrl' | 'notes'>>;

/** User-defined recipe category, e.g. "Breakfast" or "Breads" (spec #3). */
export interface Category {
  id: string;
  name: string;
  createdAt: string;
}

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

export function findForbiddenIngredients(
  input: Pick<RecipeInput, 'ingredients' | 'steps' | 'title' | 'description' | 'notes'>,
): string[] {
  const haystack = [
    input.title,
    input.description ?? '',
    input.notes ?? '',
    ...input.ingredients.map((i) => i.text),
    ...input.steps,
  ];
  const hits = new Set<string>();
  for (const text of haystack) {
    for (const pattern of FORBIDDEN_INGREDIENT_PATTERNS) {
      const m = text.match(pattern);
      if (m) hits.add(m[0].toLowerCase());
    }
  }
  return [...hits];
}

export interface ValidateOptions {
  /** Manual entry requires carbs; imports may leave them unknown. Default true. */
  requireCarbs?: boolean;
}

export function validateRecipeInput(input: RecipeInput, { requireCarbs = true }: ValidateOptions = {}): ValidationResult {
  const errors: string[] = [];
  if (!input.title || !input.title.trim()) errors.push('Title is required.');
  if (input.ingredients.filter((i) => i.text.trim()).length === 0)
    errors.push('At least one ingredient is required.');
  if (input.steps.filter((s) => s.trim()).length === 0) errors.push('At least one step is required.');
  if (!Number.isFinite(input.servings) || input.servings <= 0)
    errors.push('Servings must be a number greater than 0.');
  const carbs = input.carbsPerServing;
  if (carbs === undefined ? requireCarbs : !Number.isFinite(carbs) || carbs < 0)
    errors.push('Carbs per serving must be a number of 0 or more.');
  const forbidden = findForbiddenIngredients(input);
  if (forbidden.length > 0)
    errors.push(
      `Forbidden sweetener found (${forbidden.join(', ')}). Use ${PREFERRED_SWEETENER} as the only sugar-free sweetener.`,
    );
  return { ok: errors.length === 0, errors };
}

export function isLowCarb(recipe: Pick<Recipe, 'carbsPerServing'>): boolean {
  return recipe.carbsPerServing !== undefined && recipe.carbsPerServing <= LOW_CARB_THRESHOLD_G;
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
    (r.carbsPerServing === undefined || typeof r.carbsPerServing === 'number') &&
    typeof r.createdAt === 'string' &&
    typeof r.updatedAt === 'string' &&
    Array.isArray(r.categoryIds) &&
    typeof r.cooked === 'boolean'
  );
}

/**
 * Upgrade stored/imported data from older schema versions to the current one.
 * Returns undefined if the value isn't recoverable as a recipe.
 */
export function migrateRecipe(value: unknown): Recipe | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const r = { ...(value as Record<string, unknown>) };
  // v1 -> v2: add categories + cooked tracking.
  if (!Array.isArray(r.categoryIds)) r.categoryIds = [];
  if (typeof r.cooked !== 'boolean') r.cooked = typeof r.lastCookedAt === 'string';
  r.schemaVersion = RECIPE_SCHEMA_VERSION;
  return isRecipe(r) ? r : undefined;
}

export function isCategory(value: unknown): value is Category {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return typeof c.id === 'string' && typeof c.name === 'string' && typeof c.createdAt === 'string';
}
