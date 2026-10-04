import { formatQuantity } from '@/lib/ingredients';
import { isInPantry } from '@/pantry/isInPantry';
import type { PantryItem, Recipe } from '@/types/recipe';

/** Suggested groups for the pantry form. Any other name is allowed. */
export const PANTRY_CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Frozen', 'Bakery', 'Canned', 'Spices', 'Other'] as const;

export type ExpiryState = 'none' | 'ok' | 'soon' | 'expired';

export type PantrySort = 'name' | 'expiry';

/** Categories actually used by these items, sorted (for the filter chips). */
export function pantryCategories(items: readonly PantryItem[]): string[] {
  return [...new Set(items.map((i) => i.category?.trim()).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b));
}

/**
 * Pantry list view: optional category filter, sorted by name or by expiration date (soonest first; items
 * without a date last, then by name).
 */
export function filterSortPantry(
  items: readonly PantryItem[],
  options: { category?: string; sort?: PantrySort } = {},
): PantryItem[] {
  const out = options.category ? items.filter((i) => i.category === options.category) : [...items];
  const byName = (a: PantryItem, b: PantryItem) => a.name.localeCompare(b.name);
  if (options.sort === 'expiry') {
    return out.sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999') || byName(a, b));
  }
  return out.sort(byName);
}

function fold(value: string): string {
  return value.toLowerCase().replace(/[’‘]/g, "'");
}

/** True when `needle` appears in `haystack`, ignoring case and straight vs curly apostrophes. */
function containsText(haystack: string, needle: string): boolean {
  const n = fold(needle).trim();
  return n.length > 0 && fold(haystack).includes(n);
}

/**
 * Category-style labels Open Food Facts uses as a generic name ("Chocolate Candies"). A real product name
 * ("Almond Flour", "Peanut M&M's") has a word outside this set, so it stays the card title.
 */
const GENERIC_LABEL_WORDS = new Set(
  'chocolate chocolates candy candies sweet sweets snack snacks confection confectionery food foods product products bar bars drink drinks beverage beverages treat treats milk dark white'.split(
    ' ',
  ),
);

function isGenericLabel(name: string): boolean {
  const words = fold(name)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.length > 0 && words.every((word) => GENERIC_LABEL_WORDS.has(word));
}

function qtyLine(quantity: number | undefined, unit: string | undefined): string {
  if (quantity === undefined) return unit ? `some ${unit}` : 'on hand';
  const qty = formatQuantity(quantity);
  return unit ? `${qty} ${unit}` : qty;
}

/**
 * Pantry card copy (v1.0.8). The big title is the product the person bought (brand + product name, or the
 * typed name). A generic description ("Chocolate Candies") and the quantity sit on the smaller line.
 * Legacy scans stored the generic text as `name` and the brand separately: when a barcode item's name
 * does not already contain its brand, the brand is the title and the stored name is the generic line.
 * Manual items (no barcode) keep the typed name as the title.
 */
export function pantryCardText(
  item: Pick<PantryItem, 'name' | 'quantity' | 'unit' | 'category' | 'brand' | 'barcode' | 'description'>,
): { title: string; detail: string } {
  const name = item.name.trim();
  const brand = item.brand?.trim() ?? '';
  const category = item.category?.trim() ?? '';
  const qty = qtyLine(item.quantity, item.unit);
  let title = name;
  let generic = item.description?.trim() ?? '';
  if (!generic && item.barcode && brand && !containsText(name, brand) && isGenericLabel(name)) {
    title = brand;
    generic = name;
  } else if (generic && brand && !containsText(title, brand)) {
    title = `${brand} ${title}`.trim();
  }
  const detail = generic
    ? [generic, qty, category].filter(Boolean).join(' · ')
    : [qty, containsText(title, brand) ? '' : brand, category].filter(Boolean).join(' · ');
  return { title, detail };
}

/** How close `expiresAt` (YYYY-MM-DD) is to today. `soon` is within 3 days. */
export function expiryState(expiresAt: string | undefined, today: Date = new Date()): ExpiryState {
  if (!expiresAt || !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) return 'none';
  const [y, m, d] = expiresAt.split('-').map(Number);
  const exp = new Date(y, m - 1, d);
  if (Number.isNaN(exp.getTime())) return 'none';
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = (exp.getTime() - start.getTime()) / 86_400_000;
  if (diffDays < 0) return 'expired';
  if (diffDays <= 3) return 'soon';
  return 'ok';
}

export interface PantryMatch {
  recipe: Recipe;
  have: number;
  total: number;
  missing: string[];
}

/** Suggest recipes ranked by how many ingredients are already on hand (spec #21). */
export function rankRecipesByPantry(recipes: Recipe[], pantry: PantryItem[]): PantryMatch[] {
  return recipes
    .map((recipe) => {
      const missing: string[] = [];
      let have = 0;
      for (const ing of recipe.ingredients) {
        if (isInPantry(ing, pantry)) have++;
        else missing.push(ing.name ?? ing.text);
      }
      return { recipe, have, total: recipe.ingredients.length, missing };
    })
    .sort((a, b) => b.have / (b.total || 1) - a.have / (a.total || 1) || b.have - a.have);
}
