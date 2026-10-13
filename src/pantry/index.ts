/** Pantry features (spec #21). */
import { canUse } from '@/entitlements';
import { pantryStore } from '@/storage/pantry';
import { settingsStore } from '@/storage/settings';

import { createPantryMatcher } from './match';

export { isInPantry } from './isInPantry';
export { createPantryMatcher, type PantryMatcher, type PantryMatcherDeps } from './match';

/**
 * On-hand check used by the shopping list and grocery run.
 * Returns false when the pantry feature is gated off or hidden in Settings, so a locked or hidden
 * pantry never changes what you buy.
 */
export const pantryMatcher = createPantryMatcher({
  list: async () => ((await settingsStore.get()).features.pantry ? pantryStore.list() : []),
  canUsePantry: () => canUse('pantry'),
});
