/**
 * Recipe schema for My Recipe App.
 *
 * This is the single source of truth for the recipe shape. It is used by the
 * app's local storage, the add-recipe form, and (later) JSON export/import and
 * the remote MCP server. Keep it JSON-serializable (no Dates, functions, etc.).
 *
 * v1 feature spec: docs/SPEC.md. Fields marked (spec #N) map to items in that spec.
 */

/** Current schema version. Bump when the stored shape changes and add a migration in `migrateRecipe`. */
export const RECIPE_SCHEMA_VERSION = 3;

export type UnitSystem = 'metric' | 'imperial';

/**
 * One ingredient line. `text` is always kept (what the user/source wrote); the parsed fields
 * enable scaling, metric<->imperial conversion (spec #16), shopping-list merging (spec #12),
 * grocery run mode (spec #18) and pantry matching (spec #21). See `src/lib/ingredients.ts`.
 */
export interface Ingredient {
  /** Original free-text line, e.g. "2 1/2 tbsp allulose, powdered". */
  text: string;
  /** Parsed amount, e.g. 2.5. For ranges ("2-3 cloves") this is the low end. */
  quantity?: number;
  /** High end of a range, e.g. 3 for "2-3 cloves". */
  quantityMax?: number;
  /** Canonical unit id, e.g. "tbsp", "cup", "g", "lb" (see UNITS in src/lib/units.ts). */
  unit?: string;
  /** Ingredient name without amount/unit/prep, e.g. "allulose". Used for merging + pantry. */
  name?: string;
  /** Prep / extra info, e.g. "powdered", "minced". */
  note?: string;
  /** Note about a substitution made, e.g. "allulose instead of sugar" (spec #2). */
  substitutionNote?: string;
}

/** One instruction step (spec #15, #19). */
export interface Step {
  text: string;
  /** Timer length detected from the text ("bake 25 minutes") or set by the user. */
  durationSeconds?: number;
}

/** Nutrition per serving (spec #17). All fields optional = unknown; never default unknowns to 0. */
export interface NutritionPerServing {
  calories?: number;
  /** Total carbohydrates, g. */
  carbsG?: number;
  /** Net carbs, g (what Jason tracks). If unknown but carbs + fiber known, see `netCarbs()`. */
  netCarbsG?: number;
  proteinG?: number;
  fatG?: number;
  fiberG?: number;
  /** Where the numbers came from. */
  source?: 'manual' | 'imported' | 'computed';
}

export interface Recipe {
  /** Stable unique id (string so it can be shared across devices / servers). */
  id: string;
  schemaVersion: number;
  /** User-editable title (spec #7). */
  title: string;
  description?: string;
  ingredients: Ingredient[];
  /** Ordered instructions. */
  steps: Step[];
  /** Free-form lower-case tags, many per recipe, filterable; distinct from categories (spec #20). */
  tags: string[];
  /** Number of servings the recipe makes (> 0). Base for scaling. */
  servings: number;
  /** Per-serving nutrition (spec #17). Net carbs lives in `nutrition.netCarbsG`. */
  nutrition: NutritionPerServing;
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
  /** 1–5 stars; undefined = not rated (spec #22). */
  rating?: number;
  /** Per-recipe unit display override (spec #16); falls back to the app setting. */
  unitSystem?: UnitSystem;
  /** ISO-8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}

/** Fields a user (or an AI assistant) supplies when creating a recipe. */
export type RecipeInput = Pick<Recipe, 'title' | 'ingredients' | 'steps' | 'tags' | 'servings'> &
  Partial<
    Pick<
      Recipe,
      'nutrition' | 'description' | 'categoryIds' | 'photoUri' | 'sourceUrl' | 'notes' | 'rating' | 'unitSystem'
    >
  >;

/** Net carbs per serving: explicit value, else carbs − fiber when both known, else undefined. */
export function netCarbs(n: NutritionPerServing | undefined): number | undefined {
  if (!n) return undefined;
  if (n.netCarbsG !== undefined) return n.netCarbsG;
  if (n.carbsG !== undefined && n.fiberG !== undefined) return Math.max(0, +(n.carbsG - n.fiberG).toFixed(1));
  return undefined;
}

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
    ...input.ingredients.map((i) => [i.text, i.name ?? ''].join(' ')),
    ...input.steps.map((st) => st.text),
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

export function validateRecipeInput(
  input: RecipeInput,
  { requireCarbs = true }: ValidateOptions = {},
): ValidationResult {
  const errors: string[] = [];
  if (!input.title || !input.title.trim()) errors.push('Title is required.');
  if (input.ingredients.filter((i) => i.text.trim()).length === 0) errors.push('At least one ingredient is required.');
  if (input.steps.filter((st) => st.text.trim()).length === 0) errors.push('At least one step is required.');
  if (!Number.isFinite(input.servings) || input.servings <= 0) errors.push('Servings must be a number greater than 0.');
  const carbs = input.nutrition?.netCarbsG;
  if (carbs === undefined ? requireCarbs : !Number.isFinite(carbs) || carbs < 0)
    errors.push('Net carbs per serving must be a number of 0 or more.');
  for (const [k, v] of Object.entries(input.nutrition ?? {}))
    if (
      k !== 'source' &&
      k !== 'netCarbsG' &&
      v !== undefined &&
      (typeof v !== 'number' || !Number.isFinite(v) || v < 0)
    )
      errors.push(`Nutrition "${k}" must be a number of 0 or more.`);
  if (input.rating !== undefined && !(Number.isInteger(input.rating) && input.rating >= 1 && input.rating <= 5))
    errors.push('Rating must be 1–5 stars.');
  const forbidden = findForbiddenIngredients(input);
  if (forbidden.length > 0)
    errors.push(
      `Forbidden sweetener found (${forbidden.join(', ')}). Use ${PREFERRED_SWEETENER} as the only sugar-free sweetener.`,
    );
  return { ok: errors.length === 0, errors };
}

export function isLowCarb(recipe: Pick<Recipe, 'nutrition'>): boolean {
  const n = netCarbs(recipe.nutrition);
  return n !== undefined && n <= LOW_CARB_THRESHOLD_G;
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
    r.steps.every((st) => typeof st === 'object' && st !== null && typeof (st as Step).text === 'string') &&
    Array.isArray(r.tags) &&
    r.tags.every((t) => typeof t === 'string') &&
    typeof r.servings === 'number' &&
    typeof r.nutrition === 'object' &&
    r.nutrition !== null &&
    (r.rating === undefined || typeof r.rating === 'number') &&
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
  // v2 -> v3: structured steps, nutrition object (carbsPerServing -> nutrition.netCarbsG).
  if (Array.isArray(r.steps)) r.steps = r.steps.map((st) => (typeof st === 'string' ? { text: st } : st));
  if (typeof r.nutrition !== 'object' || r.nutrition === null) {
    r.nutrition = typeof r.carbsPerServing === 'number' ? { netCarbsG: r.carbsPerServing, source: 'manual' } : {};
  }
  delete r.carbsPerServing;
  r.schemaVersion = RECIPE_SCHEMA_VERSION;
  return isRecipe(r) ? r : undefined;
}

export function isCategory(value: unknown): value is Category {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return typeof c.id === 'string' && typeof c.name === 'string' && typeof c.createdAt === 'string';
}

/** Item on hand in the pantry (spec #21). */
export interface PantryItem {
  id: string;
  /** Normalized ingredient name used for matching, e.g. "almond flour". */
  name: string;
  quantity?: number;
  unit?: string;
  updatedAt: string;
}

export function isPantryItem(v: unknown): v is PantryItem {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  return typeof p.id === 'string' && typeof p.name === 'string';
}

/** App-wide settings. */
export interface AppSettings {
  /** Default unit display (spec #16): 'original' shows units as written. */
  unitSystem: UnitSystem | 'original';
  /** Keep the screen awake in cooking mode (spec #19). */
  cookingModeKeepAwake: boolean;
  /** Days that count as "cooked recently" (spec #9). */
  cookedRecentlyDays: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  unitSystem: 'original',
  cookingModeKeepAwake: true,
  cookedRecentlyDays: 14,
};
