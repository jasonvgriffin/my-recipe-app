import type { SyncMeta } from './record';

/** Meal planning + shopping list / grocery run types (spec #11, #12, #18). Keep JSON-serializable. */

/** Calendar day in local time, formatted YYYY-MM-DD. */
export type IsoDate = string;

/**
 * Older entries store one of these meal names. New entries store a recipe category id in `slot`.
 * Both still load.
 */
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type LegacyMealSlot = (typeof MEAL_SLOTS)[number];

/** A recipe category id, or a legacy meal name from `MEAL_SLOTS`. */
export type MealSlot = string;

/**
 * A meal on a calendar day (spec #11).
 * A saved recipe sets `recipeId`. A custom entry (v1.1.3) sets `title` and omits `recipeId`.
 */
export interface MealPlanEntry extends SyncMeta {
  date: IsoDate;
  /**
   * Saved recipe. Absent on a custom entry.
   * Older rows always have this. Do not store an empty string: that still looks like a recipe id.
   */
  recipeId?: string;
  /** Free-text meal that is not a saved recipe (pantry item, store-bought, and so on). v1.1.3. */
  title?: string;
  /** Category id, or a legacy `breakfast` | `lunch` | `dinner` | `snack`. Omitted means any time. */
  slot?: MealSlot;
  /** Optional servings override for scaling the shopping list later. Recipe entries only. */
  servings?: number;
}

/** One line on the shopping list (spec #12). */
export interface ShoppingListItem extends SyncMeta {
  /** Week (Monday, YYYY-MM-DD) whose list this item belongs to. Each item is its own synced row. */
  weekStart: IsoDate;
  /** Display text, e.g. "3 tbsp cocoa" (merged + scaled). */
  text: string;
  /** Normalized ingredient name used for merging / pantry matching. */
  name?: string;
  checked: boolean;
  /** Recipes this item came from; empty for manually added items. */
  recipeIds: string[];
  /** Grocery aisle / category (spec #18). Omitted on older rows; inferred from the name when missing. */
  aisle?: string;
  /** v1.0.7: optional quantity typed by the user (free text, e.g. "2" or "1 lb"). Absent on older rows. */
  quantity?: string;
  /** v1.0.7: optional plain notes shown under the item. Absent on older rows. */
  notes?: string;
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

/**
 * Permissive on purpose: a category id, a legacy meal name, a missing slot, or any other slot string
 * still loads. Slot is not checked, so an old backup row is not dropped.
 * A row needs a recipe id or a custom title. A row with neither is dropped.
 */
export function isMealPlanEntry(v: unknown): v is MealPlanEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  if (typeof e.id !== 'string' || typeof e.date !== 'string') return false;
  const recipeId = typeof e.recipeId === 'string' && e.recipeId.trim().length > 0;
  const title = typeof e.title === 'string' && e.title.trim().length > 0;
  return recipeId || title;
}

export function isShoppingListItem(v: unknown): v is ShoppingListItem {
  if (typeof v !== 'object' || v === null) return false;
  const i = v as Record<string, unknown>;
  return typeof i.id === 'string' && typeof i.text === 'string' && typeof i.weekStart === 'string';
}

/**
 * v1.0.7 load-time normalization (additive, no data loss): older rows have no `quantity`/`notes` and are kept as-is;
 * non-string or blank values are dropped instead of failing the row.
 */
export function normalizeShoppingListItem<T extends ShoppingListItem>(item: T): T {
  const next = { ...item };
  for (const key of ['quantity', 'notes'] as const) {
    const v: unknown = next[key];
    if (typeof v === 'string' && v.trim()) next[key] = v.trim();
    else delete next[key];
  }
  return next;
}

export function isShoppingList(v: unknown): v is ShoppingList {
  if (typeof v !== 'object' || v === null) return false;
  const l = v as Record<string, unknown>;
  return typeof l.id === 'string' && typeof l.weekStart === 'string' && Array.isArray(l.items);
}
