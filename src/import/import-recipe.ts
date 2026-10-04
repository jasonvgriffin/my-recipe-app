import { canUse as defaultCanUse, type CanUse } from '@/entitlements';
import { createRecipe } from '@/lib/recipe-utils';
import type { RecipeStore } from '@/storage/recipes';
import { findForbiddenIngredients, type Recipe, PREFERRED_SWEETENER } from '@/types/recipe';

import { draftToRecipeInput, normalizeSourceUrl } from './normalize';
import { extractRecipeHeuristically } from './parsers/heuristics';
import { extractJsonLdRecipe } from './parsers/json-ld';
import { parseRecipeText } from './parsers/text';
import {
  RecipeDraftSchema,
  RecipeImportInputSchema,
  type ImportOptions,
  type ImportResult,
  type ImportSource,
  type RecipeDraft,
  type RecipeImportInput,
} from './types';

export interface ImportDeps {
  /** Feature gate (paywall-ready). Defaults to the app-wide gate. url/text imports need `linkImport`. */
  canUse?: CanUse;
  store: Pick<RecipeStore, 'list' | 'save' | 'addCategory'>;
  /** Download a page's HTML. Injected so tests (and a future server) can stub it. */
  fetchHtml: (url: string) => Promise<string>;
  now: () => Date;
}

const fail = (code: Extract<ImportResult, { ok: false }>['code'], ...errors: string[]): ImportResult => ({
  ok: false,
  code,
  errors,
});

/**
 * Core import pipeline with explicit dependencies (portable: no app storage / UI imports).
 * The app uses `importRecipe` from '@/import', which binds the on-device deps. See docs/IMPORT_API.md.
 * Steps: validate input → produce a draft (fetch+parse / text parse / as given) → validate draft (zod)
 * → enforce house rules (no monk fruit) → normalize → dedupe by source URL → save.
 */
export async function importRecipeWith(
  deps: ImportDeps,
  input: RecipeImportInput,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const parsedInput = RecipeImportInputSchema.safeParse(input);
  if (!parsedInput.success) return fail('invalid_input', ...parsedInput.error.issues.map(formatIssue));
  const source: ImportSource | undefined = parsedInput.data.source;
  if ((input.kind === 'url' || input.kind === 'text') && !(deps.canUse ?? defaultCanUse)('linkImport')) {
    return fail('feature_locked', 'Importing from a link or text is not available.');
  }

  // 1. Turn the input into an unvalidated draft.
  let rawDraft: unknown;
  let sourceUrl = source?.url;
  if (input.kind === 'url') {
    sourceUrl = input.url;
    let html: string;
    try {
      html = await deps.fetchHtml(input.url);
    } catch (e) {
      return fail('fetch_failed', `Could not download ${input.url}: ${String(e)}`);
    }
    // JSON-LD first. Microdata / plugin / heading heuristics run only when JSON-LD
    // is missing or has no ingredients and no steps (spec #1).
    const fromJsonLd = extractJsonLdRecipe(html, input.url);
    rawDraft = draftLooksLikeRecipe(fromJsonLd) ? fromJsonLd : (extractRecipeHeuristically(html, input.url) ?? fromJsonLd);
    if (!rawDraft) return fail('no_recipe_found', 'No recipe found on that page.');
  } else if (input.kind === 'text') {
    rawDraft = parseRecipeText(input.text);
    if (!rawDraft) return fail('no_recipe_found', 'No recipe found in the text.');
  } else {
    rawDraft = input.recipe;
  }

  // 2. Validate the draft.
  const draftResult = RecipeDraftSchema.safeParse(rawDraft);
  if (!draftResult.success) {
    return fail(
      input.kind === 'structured' ? 'invalid_input' : 'no_recipe_found',
      ...draftResult.error.issues.map(formatIssue),
    );
  }
  const draft = draftResult.data;
  const effectiveSource: ImportSource = { ...source, url: draft.sourceUrl ?? sourceUrl };

  // 3. House rules.
  const forbidden = findForbiddenIngredients({
    title: draft.title,
    description: draft.description,
    notes: draft.notes,
    ingredients: draft.ingredients.map((i) => ({ text: typeof i === 'string' ? i : i.text })),
    steps: draft.steps.map((st) => (typeof st === 'string' ? { text: st } : st)),
  });
  if (forbidden.length > 0) {
    return fail(
      'forbidden_ingredient',
      `Contains ${forbidden.join(', ')}. Replace with ${PREFERRED_SWEETENER} (the only sugar-free sweetener allowed).`,
    );
  }

  // 4. Dedupe by normalized source URL.
  const key = normalizeSourceUrl(effectiveSource.url);
  const policy = options.onDuplicate ?? 'skip';
  const existing: Recipe | undefined = key
    ? (await deps.store.list()).find((r) => normalizeSourceUrl(r.sourceUrl) === key)
    : undefined;
  if (existing && policy === 'skip') {
    return { ok: true, status: 'duplicate', recipe: existing, warnings: ['A recipe from this link already exists.'] };
  }

  // 5. Normalize (resolve category names → ids) and save.
  // Imports default to Uncategorized. A web page's own `recipeCategory` ("Main Course", …) is NOT turned into a
  // category; only a structured import that names categories sets them (v1.0.6: every named category, since a recipe
  // can be in several). `options.categoryIds` (e.g. picked on the Import PDF screen) are added as well.
  const categoryIds: string[] = [...(options.categoryIds ?? [])];
  const categoryNames =
    input.kind === 'structured' ? [...new Set(draft.categories.map((name) => name.trim()).filter(Boolean))] : [];
  if (!options.dryRun) {
    for (const name of categoryNames) categoryIds.push((await deps.store.addCategory(name, deps.now())).id);
  }
  const { input: recipeInput, warnings } = draftToRecipeInput(draft, effectiveSource, [...new Set(categoryIds)]);
  const now = deps.now();
  let recipe = createRecipe(recipeInput, now);
  let status: 'created' | 'updated' = 'created';
  if (existing && policy === 'update') {
    recipe = {
      ...recipe,
      id: existing.id,
      createdAt: existing.createdAt,
      cooked: existing.cooked,
      lastCookedAt: existing.lastCookedAt,
      cookHistory: existing.cookHistory ?? [],
      notes: recipe.notes ?? existing.notes,
      photoUri: recipe.photoUri ?? existing.photoUri,
      // Keep the category the user chose; only an uncategorized recipe takes the import's.
      categoryIds: existing.categoryIds.length ? existing.categoryIds : recipe.categoryIds,
    };
    status = 'updated';
  }
  if (!options.dryRun) await deps.store.save(recipe);
  return { ok: true, status, recipe, warnings };
}

/** A JSON-LD node is "usable" when it has a title and at least one ingredient or step. */
function draftLooksLikeRecipe(draft: Partial<RecipeDraft> | undefined): boolean {
  if (!draft || typeof draft.title !== 'string' || !draft.title.trim()) return false;
  const textOf = (item: string | { text: string }) => (typeof item === 'string' ? item : item.text).trim();
  const ingredients = (draft.ingredients ?? []).some((item) => textOf(item));
  const steps = (draft.steps ?? []).some((item) => textOf(item));
  return ingredients || steps;
}

function formatIssue(issue: { path: PropertyKey[]; message: string }): string {
  return issue.path.length ? `${issue.path.map(String).join('.')}: ${issue.message}` : issue.message;
}
