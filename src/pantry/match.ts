import type { PantryItem } from '@/types/recipe';

import { ingredientKey } from '@/lib/ingredients';
import { pantryHas } from '@/lib/pantry';

/**
 * Pantry matching for the shopping list (spec #12 / #21). Storage is injected so this module stays
 * UI-free and free of the pantry store — the app binds it in `src/pantry/index.ts`.
 * When the pantry feature is unavailable, nothing is treated as on hand.
 */
export interface PantryMatcherDeps {
  list: () => Promise<PantryItem[]>;
  /** Return false when the pantry feature is gated off. Default: allowed. */
  canUsePantry?: () => boolean;
}

export function ingredientIsInPantry(pantry: PantryItem[], ingredient: string): boolean {
  return pantryHas(pantry, ingredientKey({ text: ingredient }));
}

export function createPantryMatcher(deps: PantryMatcherDeps) {
  const allowed = () => (deps.canUsePantry ? deps.canUsePantry() : true);

  return {
    /** True when `ingredient` (a line or a normalized name) is already on hand. */
    async isInPantry(ingredient: string): Promise<boolean> {
      if (!allowed()) return false;
      const pantry = await deps.list();
      return ingredientIsInPantry(pantry, ingredient);
    },
    /**
     * Subset of ingredient keys (see `ingredientKey`) that shopping should skip.
     * One pantry read for the whole list.
     */
    async skipKeys(keys: readonly string[]): Promise<Set<string>> {
      if (!allowed() || keys.length === 0) return new Set();
      const pantry = await deps.list();
      return new Set(keys.filter((key) => key && pantryHas(pantry, key)));
    },
  };
}

export type PantryMatcher = ReturnType<typeof createPantryMatcher>;
