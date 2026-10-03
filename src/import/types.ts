/**
 * Recipe import contract. See docs/IMPORT_API.md.
 *
 * Every way a recipe enters the app — the in-app "Import from link" UI, Android share intents,
 * deep links (myrecipeapp://import?url=...), a future MCP server ("Hey AI, send this recipe to my
 * recipe app"), and sync — calls `importRecipe(input)` with one of these inputs.
 *
 * This module has NO UI dependencies (no React / react-native imports).
 */
import { z } from 'zod';

import type { Recipe } from '@/types/recipe';

import { isHttpUrl } from './url';

const httpUrl = () => z.string().trim().refine(isHttpUrl, 'must be an http(s) URL');

/** Where an import came from (for analytics/debugging and future per-channel rules). */
export const ImportChannelSchema = z.enum(['app-link', 'app-text', 'share-intent', 'deep-link', 'mcp', 'sync', 'file']);
export type ImportChannel = z.infer<typeof ImportChannelSchema>;

export const ImportSourceSchema = z.object({
  /** Original web page of the recipe; used for dedupe and kept on the recipe (spec #5). */
  url: httpUrl().optional(),
  channel: ImportChannelSchema.optional(),
  /** Free-form label, e.g. "Grok", "Chrome share". */
  label: z.string().trim().max(200).optional(),
});
export type ImportSource = z.infer<typeof ImportSourceSchema>;

const ingredient = z.union([
  z.string(),
  z.object({ text: z.string(), substitutionNote: z.string().optional() }),
]);

/**
 * A recipe as supplied by an outside party (parser, AI assistant, share intent...).
 * Lenient on purpose: only `title` plus at least one ingredient or step is required.
 * Ingredients may be plain strings or `{ text }` objects. Unknown keys are stripped.
 */
export const RecipeDraftSchema = z
  .object({
    title: z.string().trim().min(1, 'title is required').max(300),
    description: z.string().trim().max(5000).optional(),
    ingredients: z.array(ingredient).max(500).default([]),
    steps: z.array(z.string()).max(500).default([]),
    tags: z.array(z.string()).max(100).default([]),
    /** Category names (not ids); created on import if missing. */
    categories: z.array(z.string()).max(50).default([]),
    servings: z.number().positive().max(1000).optional(),
    carbsPerServing: z.number().min(0).max(10000).optional(),
    notes: z.string().max(20000).optional(),
    /** http(s) or file:// URI of a photo. TODO(spec #4): download remote photos into app storage. */
    photoUrl: z
      .string()
      .trim()
      .refine((v) => isHttpUrl(v) || v.startsWith('file://'), 'must be an http(s) or file:// URI')
      .optional(),
    sourceUrl: httpUrl().optional(),
  })
  .refine((d) => d.ingredients.length > 0 || d.steps.length > 0, {
    message: 'at least one ingredient or step is required',
    path: ['ingredients'],
  });
export type RecipeDraft = z.input<typeof RecipeDraftSchema>;
export type ParsedRecipeDraft = z.output<typeof RecipeDraftSchema>;

export const RecipeImportInputSchema = z.discriminatedUnion('kind', [
  /** Fetch a web page and parse it (schema.org JSON-LD first, then heuristics). */
  z.object({ kind: z.literal('url'), url: httpUrl(), source: ImportSourceSchema.optional() }),
  /** Already-structured recipe, e.g. from an AI assistant via MCP or a JSON file. */
  z.object({ kind: z.literal('structured'), recipe: z.unknown(), source: ImportSourceSchema.optional() }),
  /** Free text, e.g. shared from another app or dictated. */
  z.object({ kind: z.literal('text'), text: z.string().min(1).max(100_000), source: ImportSourceSchema.optional() }),
]);

export type RecipeImportInput =
  | { kind: 'url'; url: string; source?: ImportSource }
  | { kind: 'structured'; recipe: RecipeDraft; source?: ImportSource }
  | { kind: 'text'; text: string; source?: ImportSource };

/** What to do if a recipe with the same (normalized) source URL already exists. */
export type DuplicatePolicy = 'skip' | 'update' | 'create';

export interface ImportOptions {
  /** Default 'skip': return the existing recipe untouched. */
  onDuplicate?: DuplicatePolicy;
  /** Validate and normalize only; don't write to storage. Default false. */
  dryRun?: boolean;
}

export type ImportErrorCode =
  | 'invalid_input' // input/draft failed schema validation
  | 'forbidden_ingredient' // e.g. monk fruit (allulose is the only allowed sugar-free sweetener)
  | 'fetch_failed' // URL couldn't be downloaded
  | 'no_recipe_found' // page/text contained no recognizable recipe
  | 'not_implemented'; // parser not built yet

export type ImportResult =
  | {
      ok: true;
      status: 'created' | 'updated' | 'duplicate';
      recipe: Recipe;
      /** Non-fatal issues, e.g. "carbs per serving unknown". */
      warnings: string[];
    }
  | { ok: false; code: ImportErrorCode; errors: string[] };
