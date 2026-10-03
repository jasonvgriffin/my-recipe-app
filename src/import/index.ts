/**
 * Public API of the import module. UI, deep links, share intents (and later MCP / sync) import through here only.
 * A non-app host (e.g. a Node MCP server) should use `importRecipeWith(serverDeps, input)` from './import-recipe'
 * to avoid pulling in the on-device store.
 */
import { appImportDeps } from './app-deps';
import { importRecipeWith, type ImportDeps } from './import-recipe';
import type { ImportOptions, ImportResult, RecipeImportInput } from './types';

/** Import a recipe into the app. Never throws for bad input; check `result.ok`. */
export function importRecipe(
  input: RecipeImportInput,
  options: ImportOptions = {},
  deps: ImportDeps = appImportDeps,
): Promise<ImportResult> {
  return importRecipeWith(deps, input, options);
}

export { importRecipeWith, appImportDeps, type ImportDeps };
export { importPathFromIncomingUrl, parseImportDeepLink, sharedPayloadToText, shareTextToImportInput } from './deep-link';
export { normalizeSourceUrl } from './normalize';
export * from './types';
