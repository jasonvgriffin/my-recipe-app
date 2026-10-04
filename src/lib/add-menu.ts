import type { FeatureId } from '@/entitlements';

/**
 * The center “+” menu (v1.0.2, Cronometer-style add sheet). Pure data + filtering so it is unit-tested and
 * the sheet stays thin. Every item opens an EXISTING flow; items behind an optional feature list that feature
 * in `needs` and disappear when it is locked by the gate or hidden in Settings (recipes-first rule).
 * v1.0.3: no separate Scan Barcode item; scanning lives on the Shopping list (“Scan Item”) and Pantry screens,
 * reached through Add to Shopping List / Add Pantry Item.
 */
export type AddMenuItemId =
  | 'add-recipe'
  | 'import-link'
  | 'search-recipes'
  | 'add-shopping'
  | 'add-pantry'
  | 'plan-meal'
  | 'share-recipe'
  | 'what-can-i-make';

export interface AddMenuItem {
  id: AddMenuItemId;
  label: string;
  /** Ionicons glyph name. */
  icon: string;
  needs?: FeatureId[];
}

export const ADD_MENU_ITEMS: readonly AddMenuItem[] = [
  { id: 'add-recipe', label: 'Add Recipe', icon: 'create-outline' },
  { id: 'import-link', label: 'Import Link', icon: 'link-outline', needs: ['linkImport'] },
  { id: 'search-recipes', label: 'Search Recipes', icon: 'search-outline' },
  { id: 'add-shopping', label: 'Add to Shopping List', icon: 'cart-outline', needs: ['shoppingList'] },
  { id: 'add-pantry', label: 'Add Pantry Item', icon: 'basket-outline', needs: ['pantry'] },
  { id: 'plan-meal', label: 'Meal Plan', icon: 'calendar-outline', needs: ['mealPlan'] },
  { id: 'share-recipe', label: 'Share Recipes', icon: 'share-social-outline', needs: ['pdfExport'] },
  { id: 'what-can-i-make', label: 'What Can I Make?', icon: 'restaurant-outline', needs: ['pantry'] },
];

/** Items to show, given `visible(id)` = gate allows it AND the user hasn't hidden it (`useFeatureVisible`). */
export function visibleAddMenuItems(visible: (id: FeatureId) => boolean): AddMenuItem[] {
  return ADD_MENU_ITEMS.filter((item) => (item.needs ?? []).every(visible));
}

/** Route for an item (expo-router path). Meal Plan (formerly “Plan a Meal”) opens today's day plan. */
export function addMenuHref(id: AddMenuItemId, ctx: { today: string }): string {
  switch (id) {
    case 'add-recipe':
      return '/add';
    case 'import-link':
      return '/import';
    case 'search-recipes':
      return '/recipes?focus=search';
    case 'add-shopping':
      return '/shopping';
    case 'add-pantry':
      return '/pantry';
    case 'plan-meal':
      return `/meal-plan/${ctx.today}`;
    case 'share-recipe':
      // v1.0.3: share as a PDF (pick recipes → share sheet).
      return '/recipes?select=pdf';
    case 'what-can-i-make':
      return '/pantry-match';
  }
}
