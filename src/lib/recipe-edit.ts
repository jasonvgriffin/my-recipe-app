import { createRecipe } from '@/lib/recipe-utils';
import { isHttpUrl } from '@/import/url';
import { validateRecipeInput, type Ingredient, type Recipe, type RecipeInput, type Step } from '@/types/recipe';

/** One ingredient row in the editor (spec #2). */
export interface IngredientDraft {
  text: string;
  substitutionNote: string;
}

/** One step row. `minutes` is blank when the timer should be detected from the text. */
export interface StepDraft {
  text: string;
  minutes: string;
}

export interface RecipeEditorState {
  title: string;
  description: string;
  notes: string;
  servings: string;
  sourceUrl: string;
  photoUri?: string;
  /** v1.0.5: the recipe's category ([] = Uncategorized) and tags are edited here too. Missing = keep original. */
  categoryIds?: string[];
  tags?: string[];
  ingredients: IngredientDraft[];
  steps: StepDraft[];
}

export function secondsToMinutes(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return '';
  const minutes = Math.round((seconds / 60) * 100) / 100;
  return String(minutes);
}

export function recipeToEditorState(recipe: Recipe): RecipeEditorState {
  return {
    title: recipe.title,
    description: recipe.description ?? '',
    notes: recipe.notes ?? '',
    servings: String(recipe.servings),
    sourceUrl: recipe.sourceUrl ?? '',
    photoUri: recipe.photoUri,
    categoryIds: [...recipe.categoryIds],
    tags: [...recipe.tags],
    ingredients: recipe.ingredients.length
      ? recipe.ingredients.map((i) => ({ text: i.text, substitutionNote: i.substitutionNote ?? '' }))
      : [{ text: '', substitutionNote: '' }],
    steps: recipe.steps.length
      ? recipe.steps.map((st) => ({ text: st.text, minutes: secondsToMinutes(st.durationSeconds) }))
      : [{ text: '', minutes: '' }],
  };
}

/** Move an item toward the start (`-1`) or the end (`1`). Out-of-range moves return the same array. */
export function moveItem<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const nextIndex = index + direction;
  if (index < 0 || index >= items.length || nextIndex < 0 || nextIndex >= items.length) return [...items];
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}

export function editorStateToInput(
  state: RecipeEditorState,
  original: Recipe,
): { ok: true; input: RecipeInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const ingredients: Ingredient[] = state.ingredients
    .map((row) => ({
      text: row.text.trim(),
      substitutionNote: row.substitutionNote.trim() || undefined,
    }))
    .filter((row) => row.text);
  const steps: Step[] = [];
  state.steps.forEach((row, index) => {
    const text = row.text.trim();
    if (!text) return;
    const minutes = row.minutes.trim();
    if (!minutes) {
      steps.push({ text });
      return;
    }
    const n = Number(minutes);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push(`Step ${index + 1} timer must be a positive number of minutes.`);
      return;
    }
    steps.push({ text, durationSeconds: Math.round(n * 60) });
  });
  const sourceUrl = state.sourceUrl.trim();
  if (sourceUrl && !isHttpUrl(sourceUrl)) errors.push('Source link must be an http(s) URL.');
  if (errors.length) return { ok: false, errors };

  const input: RecipeInput = {
    title: state.title,
    description: state.description.trim() || undefined,
    notes: state.notes.trim() || undefined,
    ingredients,
    steps,
    tags: state.tags ?? original.tags,
    servings: Number(state.servings),
    categoryIds: state.categoryIds ?? original.categoryIds,
    photoUri: state.photoUri,
    sourceUrl: sourceUrl || undefined,
    rating: original.rating,
    unitSystem: original.unitSystem,
  };
  const validated = validateRecipeInput(input);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  return { ok: true, input };
}

/**
 * Build the saved recipe. Keeps identity, authorship/household (SyncMeta), cooked history, rating,
 * categories, tags and unit preference — editing must not reset them.
 */
export function applyRecipeEdit(original: Recipe, input: RecipeInput, now: Date = new Date()): Recipe {
  const next = createRecipe(input, now, original.id);
  return {
    // Keep fields the editor does not own (sync meta: householdId/createdBy, plus any newer fields).
    ...original,
    ...next,
    createdAt: original.createdAt,
    cooked: original.cooked,
    lastCookedAt: original.lastCookedAt,
    cookHistory: original.cookHistory ?? [],
    updatedAt: now.toISOString(),
  };
}
