import type { IsoDate, MealPlanEntry, ShoppingList, ShoppingListItem } from '@/types/meal-plan';
import type { Ingredient, PantryItem, Recipe } from '@/types/recipe';

import { isInPantry } from '@/pantry/isInPantry';

import { aisleForIngredient, AISLES, normalizeAisle, type Aisle } from './aisles';
import { weekDates } from './dates';
import { formatIngredient, ingredientKey, parseIngredient, scaleIngredient } from './ingredients';
import { uuid } from '@/lib/ids';
import { getUnit } from './units';

export interface CompileOptions {
  /** Items on hand are skipped (spec #21). */
  pantry?: PantryItem[];
  /**
   * Extra skip check, keyed by `ingredientKey` (spec #12). The app passes keys already in the pantry
   * via `isInPantry` / `pantryMatcher.skipKeys` when that feature is available.
   */
  skip?: (ingredientKey: string) => boolean;
  /** Week the items belong to ('' or `recipe:{id}` for an ad-hoc grocery run). */
  weekStart?: IsoDate;
  now?: Date;
}

/**
 * Compile a shopping list (spec #12) / grocery run (spec #18) from recipes.
 * Merges by ingredient name; quantities with the same unit (or convertible units of the same
 * dimension) are summed; servings overrides scale amounts; pantry items are skipped.
 */
export function compileItems(
  parts: { recipe: Recipe; servings?: number }[],
  options: CompileOptions = {},
): ShoppingListItem[] {
  const groups = new Map<string, { ing: Ingredient; recipeIds: string[]; summable: boolean; aisleText: string }>();
  for (const { recipe, servings } of parts) {
    const factor = servings && recipe.servings ? servings / recipe.servings : 1;
    for (const raw of recipe.ingredients) {
      const ing = scaleIngredient(raw, factor);
      const key = ingredientKey(ing);
      if (!key || isInPantry(ing, options.pantry ?? []) || options.skip?.(key)) continue;
      const g = groups.get(key);
      if (!g) {
        groups.set(key, {
          ing: { ...ing },
          recipeIds: [recipe.id],
          summable: ing.quantity !== undefined,
          aisleText: `${ing.text} ${ing.name ?? ''}`,
        });
        continue;
      }
      if (!g.recipeIds.includes(recipe.id)) g.recipeIds.push(recipe.id);
      const a = g.ing;
      const ua = getUnit(a.unit);
      const ub = getUnit(ing.unit);
      if (g.summable && ing.quantity !== undefined && a.quantity !== undefined) {
        if (a.unit === ing.unit) a.quantity += ing.quantity;
        else if (ua && ub && ua.dimension === ub.dimension && ua.dimension !== 'count')
          a.quantity += (ing.quantity * ub.toBase) / ua.toBase;
        else g.summable = false;
        a.quantityMax = undefined;
      } else g.summable = false;
    }
  }
  const ts = (options.now ?? new Date()).toISOString();
  return [...groups.entries()].map(([key, g]) => ({
    id: uuid(),
    weekStart: options.weekStart ?? '',
    createdAt: ts,
    updatedAt: ts,
    text: g.summable ? formatIngredient(g.ing) : (g.ing.name ?? g.ing.text),
    name: key,
    checked: false,
    recipeIds: g.recipeIds,
    aisle: aisleForIngredient(g.aisleText),
  }));
}

/** Ingredient keys a week's plan would shop for, before pantry skip. */
export function collectIngredientKeys(entries: MealPlanEntry[], recipes: Recipe[], days: readonly IsoDate[]): string[] {
  const daySet = new Set(days);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const keys: string[] = [];
  for (const entry of entries) {
    if (!daySet.has(entry.date)) continue;
    const recipe = byId.get(entry.recipeId);
    if (!recipe) continue;
    for (const ing of recipe.ingredients) {
      const key = ingredientKey(ing);
      if (key) keys.push(key);
    }
  }
  return keys;
}

export function emptyShoppingList(weekStart: IsoDate, now: Date = new Date()): ShoppingList {
  const ts = now.toISOString();
  return { id: `week-${weekStart}`, weekStart, items: [], createdAt: ts, updatedAt: ts };
}

/**
 * Keep checked state and manually added lines when a week is rebuilt (spec #12).
 * Plan lines match on normalized name; manual lines (no recipeIds) are appended if they were not merged.
 */
export function reconcileShoppingList(compiled: ShoppingList, previous?: ShoppingList): ShoppingList {
  if (!previous) return compiled;
  const prevByName = new Map<string, ShoppingListItem[]>();
  for (const item of previous.items) {
    const key = item.name || item.text;
    const bucket = prevByName.get(key) ?? [];
    bucket.push(item);
    prevByName.set(key, bucket);
  }
  const used = new Set<string>();
  const items = compiled.items.map((item) => {
    const matches = (prevByName.get(item.name || item.text) ?? []).filter((p) => !used.has(p.id));
    if (matches.length === 0) return item;
    for (const match of matches) used.add(match.id);
    return {
      ...item,
      id: matches[0].id,
      checked: matches.some((m) => m.checked),
      createdAt: matches[0].createdAt,
    };
  });
  for (const item of previous.items) {
    if (item.recipeIds.length === 0 && !used.has(item.id)) items.push({ ...item, weekStart: compiled.weekStart });
  }
  return { ...compiled, items, createdAt: previous.createdAt };
}

/** Compile a week, then reapply checks and manual lines. `skip` comes from `isInPantry` when pantry is available. */
export function compileWeekShoppingList(
  weekStart: IsoDate,
  entries: MealPlanEntry[],
  recipes: Recipe[],
  previous: ShoppingList | undefined,
  skip?: (ingredientKey: string) => boolean,
  now: Date = new Date(),
): ShoppingList {
  const days = weekDates(weekStart);
  const compiled = buildShoppingList(weekStart, days, entries, recipes, now, { skip, weekStart });
  return reconcileShoppingList(compiled, previous);
}

/** One recipe, stripped to a buy list (spec #18). Stored under weekStart `recipe:{id}` so it does not mix into a week. */
export function compileRecipeShoppingList(
  recipe: Recipe,
  previous: ShoppingList | undefined,
  skip?: (ingredientKey: string) => boolean,
  now: Date = new Date(),
): ShoppingList {
  const weekStart = `recipe:${recipe.id}`;
  const ts = now.toISOString();
  const compiled: ShoppingList = {
    id: `week-${weekStart}`,
    weekStart,
    items: compileItems([{ recipe }], { weekStart, skip, now }),
    createdAt: previous?.createdAt ?? ts,
    updatedAt: ts,
  };
  return reconcileShoppingList(compiled, previous);
}

export function addManualItem(list: ShoppingList, text: string, now: Date = new Date()): ShoppingList {
  const trimmed = text.trim();
  if (!trimmed) return list;
  const ing = parseIngredient(trimmed);
  const ts = now.toISOString();
  const item: ShoppingListItem = {
    id: uuid(),
    weekStart: list.weekStart,
    createdAt: ts,
    updatedAt: ts,
    text: trimmed,
    name: ingredientKey(ing) || undefined,
    checked: false,
    recipeIds: [],
    aisle: aisleForIngredient(trimmed),
  };
  return { ...list, items: [...list.items, item], updatedAt: ts };
}

/** Drop every checked line (spec #12 "clear checked"). */
export function clearChecked(list: ShoppingList, now: Date = new Date()): ShoppingList {
  return { ...list, items: list.items.filter((i) => !i.checked), updatedAt: now.toISOString() };
}

export function setItemChecked(
  list: ShoppingList,
  itemId: string,
  checked: boolean,
  now: Date = new Date(),
): ShoppingList {
  const ts = now.toISOString();
  return {
    ...list,
    items: list.items.map((i) => (i.id === itemId ? { ...i, checked, updatedAt: ts } : i)),
    updatedAt: ts,
  };
}

export interface AisleGroup {
  aisle: Aisle;
  items: ShoppingListItem[];
}

/** Group a buy list by aisle. Unchecked lines come first within each aisle (spec #18). */
export function groupByAisle(items: ShoppingListItem[]): AisleGroup[] {
  const groups = new Map<Aisle, ShoppingListItem[]>();
  for (const item of items) {
    const aisle = normalizeAisle(item.aisle, `${item.text} ${item.name ?? ''}`);
    const bucket = groups.get(aisle) ?? [];
    bucket.push(item);
    groups.set(aisle, bucket);
  }
  return AISLES.filter((aisle) => groups.has(aisle)).map((aisle) => ({
    aisle,
    items: groups
      .get(aisle)!
      .slice()
      .sort((a, b) => Number(a.checked) - Number(b.checked) || a.text.localeCompare(b.text)),
  }));
}

export function shoppingProgress(items: ShoppingListItem[]): { checked: number; total: number; fraction: number } {
  const total = items.length;
  const checked = items.filter((i) => i.checked).length;
  return { checked, total, fraction: total === 0 ? 0 : checked / total };
}

/** Shopping list for the meal-plan entries in a week (spec #12). */
export function buildShoppingList(
  weekStart: IsoDate,
  weekDays: IsoDate[],
  entries: MealPlanEntry[],
  recipes: Recipe[],
  now: Date = new Date(),
  options: CompileOptions = {},
): ShoppingList {
  const days = new Set(weekDays);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const parts = entries
    .filter((e) => days.has(e.date) && byId.has(e.recipeId))
    .map((e) => ({ recipe: byId.get(e.recipeId)!, servings: e.servings }));
  const ts = now.toISOString();
  return {
    id: `week-${weekStart}`,
    weekStart,
    items: compileItems(parts, { ...options, weekStart, now }),
    createdAt: ts,
    updatedAt: ts,
  };
}

export function toggleItem(list: ShoppingList, itemId: string, now: Date = new Date()): ShoppingList {
  return {
    ...list,
    items: list.items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked, updatedAt: now.toISOString() } : i)),
    updatedAt: now.toISOString(),
  };
}
