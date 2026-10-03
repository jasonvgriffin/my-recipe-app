import { PREFERRED_SWEETENER } from '@/types/recipe';
import type { ImportErrorCode } from '@/import/types';

/** User-facing copy for import failures. The raw `errors` from importRecipe are kept for detail. */
export function importErrorMessage(code: ImportErrorCode, errors: string[]): string {
  switch (code) {
    case 'fetch_failed':
      return 'Could not download that page. Check the link and your connection, then try again.';
    case 'no_recipe_found':
      return 'No recipe was found. Paste the recipe text instead, with a title, an Ingredients section, and a Steps section.';
    case 'forbidden_ingredient':
      return (
        errors[0] ??
        `That recipe uses a sweetener other than ${PREFERRED_SWEETENER}. Allulose is the only sugar-free sweetener allowed.`
      );
    case 'invalid_input':
      return errors[0]
        ? `That input could not be imported. ${errors[0]}`
        : 'That input could not be imported. Paste a full https link or the recipe text.';
    case 'feature_locked':
      return 'Importing from a link or shared text is not available.';
    default:
      return errors.join('\n') || 'Import failed.';
  }
}
