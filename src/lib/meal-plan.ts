import { MEAL_SLOTS, type IsoDate, type LegacyMealSlot, type MealPlanEntry } from '@/types/meal-plan';
import type { Category } from '@/types/recipe';

/**
 * A meal the day screen is showing but has not written yet.
 * Lives outside React so folding (the day pane unmounts under 600dp) does not drop it.
 * Changing the open date clears it.
 */
export interface PendingMeal {
  date: IsoDate;
  recipeId: string;
  /** Category id. Omitted means any time. */
  slot?: string;
  /** Servings override. Omitted uses the recipe's servings until the stepper changes it. */
  servings?: number;
}

let pendingMeal: PendingMeal | null = null;
const pendingListeners = new Set<() => void>();

export function getPendingMeal(): PendingMeal | null {
  return pendingMeal;
}

export function setPendingMeal(next: PendingMeal | null): void {
  pendingMeal = next;
  pendingListeners.forEach((listener) => listener());
}

export function subscribePendingMeal(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}

/** Display names for entries stored before slots were category ids. */
export const LEGACY_MEAL_LABELS: Record<LegacyMealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export const ANY_TIME_LABEL = 'Any time';
export const CATEGORY_REMOVED_LABEL = 'Category removed';

type CategoryRef = Pick<Category, 'id' | 'name'>;

export interface ResolvedMealSlot {
  /** Group key. `any` when the entry has no slot. */
  key: string;
  label: string;
  /** Set when the slot matches a current category by id or by legacy name. */
  categoryId?: string;
}

export interface MealPlanGroup {
  key: string;
  label: string;
  items: MealPlanEntry[];
}

function legacySlot(slot: string): LegacyMealSlot | undefined {
  const key = slot.trim().toLowerCase();
  return (MEAL_SLOTS as readonly string[]).includes(key) ? (key as LegacyMealSlot) : undefined;
}

/**
 * Label for a stored meal slot.
 * Category id first, then a case-insensitive match of a legacy name (`dinner` → Dinner).
 * A legacy name with no category shows Breakfast, Lunch, Dinner, or Snack.
 * "Category removed" is only for a stored category id whose category is gone.
 * No slot is Any time.
 */
export function resolveMealSlot(slot: unknown, categories: readonly CategoryRef[]): ResolvedMealSlot {
  const trimmed = typeof slot === 'string' ? slot.trim() : '';
  if (!trimmed) return { key: 'any', label: ANY_TIME_LABEL };

  const byId = categories.find((c) => c.id === trimmed);
  if (byId) return { key: byId.id, label: byId.name, categoryId: byId.id };

  const legacy = legacySlot(trimmed);
  if (legacy) {
    const byName = categories.find((c) => c.name.trim().toLowerCase() === legacy);
    if (byName) return { key: byName.id, label: byName.name, categoryId: byName.id };
    return { key: `legacy:${legacy}`, label: LEGACY_MEAL_LABELS[legacy] };
  }

  return { key: `removed:${trimmed}`, label: CATEGORY_REMOVED_LABEL };
}

/** Saved entries grouped by resolved category. Empty categories are omitted. Legacy leftovers still show. */
export function groupMealPlanEntries(
  entries: readonly MealPlanEntry[],
  categories: readonly CategoryRef[],
): MealPlanGroup[] {
  const resolved = entries.map((entry) => ({ entry, slot: resolveMealSlot(entry.slot, categories) }));
  const groups: MealPlanGroup[] = [];

  const any = resolved.filter((row) => row.slot.key === 'any').map((row) => row.entry);
  if (any.length > 0) groups.push({ key: 'any', label: ANY_TIME_LABEL, items: any });

  for (const category of categories) {
    const items = resolved.filter((row) => row.slot.categoryId === category.id).map((row) => row.entry);
    if (items.length > 0) groups.push({ key: category.id, label: category.name, items });
  }

  for (const legacy of MEAL_SLOTS) {
    const key = `legacy:${legacy}`;
    const items = resolved.filter((row) => row.slot.key === key).map((row) => row.entry);
    if (items.length > 0) groups.push({ key, label: LEGACY_MEAL_LABELS[legacy], items });
  }

  const removed = resolved.filter((row) => row.slot.key.startsWith('removed:')).map((row) => row.entry);
  if (removed.length > 0) groups.push({ key: 'removed', label: CATEGORY_REMOVED_LABEL, items: removed });

  return groups;
}

/** Add-chip default: the Dinner category when it exists, otherwise the first category. */
export function defaultMealCategoryId(categories: readonly CategoryRef[]): string | undefined {
  const dinner = categories.find((c) => c.name.trim().toLowerCase() === 'dinner');
  return (dinner ?? categories[0])?.id;
}
