/** Cook-with-me public API (spec #24). See docs/COOK_API.md. */
import { recipeStore } from '@/storage/recipes';
import { defaultStore } from '@/storage/kv';

import { createCookSession } from './session';

export * from './session';
export { parseCookDeepLink, runCookCommand, type CookCommand } from './deep-link';

/** The app-wide session bound to on-device storage. Cooking mode UI and deep links use this instance. */
export const cookSession = createCookSession({ getRecipe: (id) => recipeStore.get(id), kv: defaultStore });
