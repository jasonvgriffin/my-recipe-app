import type { SyncMeta } from './sync';

/** Meal planning + shopping list / grocery run types (spec #11, #12, #18). Keep JSON-serializable. */

/** Calendar day in local time, formatted YYYY-MM-DD. */
export type IsoDate = string;

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEAL_SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** A recipe placed on a calendar day (spec #11). */
export interface MealPlanEntry extends SyncMeta {
  date: IsoDate;
  recipeId: string;
  slot?: MealSlot;
  /** Optional servings override for scaling the shopping list later. */
  servings?: number;
}

/** One line on the shopping list (spec #12). */
export interface ShoppingListItem extends SyncMeta {
  /** Week (Monday, YYYY-MM-DD) whose list this item belongs to. Each item is its own synced row. */
  weekStart: IsoDate;
  /** Display text, e.g. "3 tbsp allulose" (merged + scaled). */
  text: string;
  /** Normalized ingredient name used for merging / pantry matching. */
  name?: string;
  checked: boolean;
  /** Recipes this item came from; empty for manually added items. */
  recipeIds: string[];
}

/** A shopping list for a planned week — a VIEW assembled from ShoppingListItem rows (not stored itself). */
export interface ShoppingList {
  id: string;
  /** First day (YYYY-MM-DD) of the week it was compiled from. */
  weekStart: IsoDate;
  items: ShoppingListItem[];
  createdAt: string;
  updatedAt: string;
}

export function isMealPlanEntry(v: unknown): v is MealPlanEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return typeof e.id === 'string' && typeof e.date === 'string' && typeof e.recipeId === 'string';
}

export function isShoppingListItem(v: unknown): v is ShoppingListItem {
  if (typeof v !== 'object' || v === null) return false;
  const i = v as Record<string, unknown>;
  return typeof i.id === 'string' && typeof i.text === 'string' && typeof i.weekStart === 'string';
}

export function isShoppingList(v: unknown): v is ShoppingList {
  if (typeof v !== 'object' || v === null) return false;
  const l = v as Record<string, unknown>;
  return typeof l.id === 'string' && typeof l.weekStart === 'string' && Array.isArray(l.items);
}
