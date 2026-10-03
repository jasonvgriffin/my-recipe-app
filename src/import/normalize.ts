import type { RecipeInput } from '@/types/recipe';

import type { ImportSource, ParsedRecipeDraft } from './types';
import { isHttpUrl, parseUrl } from './url';

const TRACKING_PARAMS = /^(utm_.*|fbclid|gclid|mc_cid|mc_eid|ref|ref_src|igshid|si)$/i;

/**
 * Canonical form of a source URL used for dedupe: lower-case host without "www.", no hash,
 * no tracking params, sorted query, no trailing slash. Returns undefined for invalid URLs.
 */
export function normalizeSourceUrl(url: string | undefined): string | undefined {
  if (!url || !isHttpUrl(url)) return undefined;
  const u = parseUrl(url)!;
  const host = u.host.replace(/^www\./, '').replace(/:(80|443)$/, '');
  const params = u.query
    .filter(([k]) => !TRACKING_PARAMS.test(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  const path = u.path.replace(/\/+$/, '');
  return `https://${host}${path}${params.length ? `?${params.join('&')}` : ''}`;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Convert a validated draft into the app's RecipeInput (category names resolved by the caller). */
export function draftToRecipeInput(
  draft: ParsedRecipeDraft,
  source: ImportSource | undefined,
  categoryIds: string[],
): { input: RecipeInput; warnings: string[] } {
  const warnings: string[] = [];
  const ingredients = draft.ingredients
    .map((i) => (typeof i === 'string' ? { text: clean(i) } : { ...i, text: clean(i.text) }))
    .filter((i) => i.text);
  const steps = draft.steps.map(clean).filter(Boolean);
  if (draft.servings === undefined) warnings.push('Servings unknown; defaulted to 1.');
  if (draft.carbsPerServing === undefined) warnings.push('Carbs per serving unknown; please add it.');
  if (ingredients.length === 0) warnings.push('No ingredients found.');
  if (steps.length === 0) warnings.push('No steps found.');
  return {
    input: {
      title: clean(draft.title),
      description: draft.description?.trim() || undefined,
      ingredients,
      steps,
      tags: draft.tags,
      servings: draft.servings ?? 1,
      carbsPerServing: draft.carbsPerServing,
      notes: draft.notes?.trim() || undefined,
      photoUri: draft.photoUrl,
      sourceUrl: draft.sourceUrl ?? source?.url,
      categoryIds,
    },
    warnings,
  };
}
