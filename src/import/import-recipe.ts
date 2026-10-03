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
  type RecipeImportInput,
} from './types';

export interface ImportDeps {
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
    rawDraft = extractJsonLdRecipe(html, input.url) ?? extractRecipeHeuristically(html, input.url);
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
  const categoryIds: string[] = [];
  if (!options.dryRun) {
    for (const name of draft.categories) {
      if (name.trim()) categoryIds.push((await deps.store.addCategory(name, deps.now())).id);
    }
  }
  const { input: recipeInput, warnings } = draftToRecipeInput(draft, effectiveSource, categoryIds);
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
      notes: recipe.notes ?? existing.notes,
      photoUri: recipe.photoUri ?? existing.photoUri,
      categoryIds: [...new Set([...existing.categoryIds, ...recipe.categoryIds])],
    };
    status = 'updated';
  }
  if (!options.dryRun) await deps.store.save(recipe);
  return { ok: true, status, recipe, warnings };
}

function formatIssue(issue: { path: PropertyKey[]; message: string }): string {
  return issue.path.length ? `${issue.path.map(String).join('.')}: ${issue.message}` : issue.message;
}
