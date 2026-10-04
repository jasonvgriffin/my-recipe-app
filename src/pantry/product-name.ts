/**
 * v1.0.7 barcode product names (UI-free, unit-tested in __tests__/product-name.test.ts).
 *
 * Open Food Facts often has both a specific product name ("peanut m&m's") and generic text ("CHOCOLATE CANDIES",
 * from generic_name / categories, or a USDA-imported product_name). Prefer the specific name; fall back to the
 * generic text only when there is no product name. ALL-CAPS (and all-lowercase) names become title case, keeping
 * things like M&M's sensible. Name and brand only — never nutrition.
 */

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
const UNIT_WORDS = new Set(['oz', 'fl', 'lb', 'lbs', 'g', 'kg', 'mg', 'ml', 'l', 'ct', 'pk', 'qt', 'gal']);

function capitalizeSegment(segment: string): string {
  const i = segment.search(/\p{L}/u);
  if (i < 0) return segment;
  return segment.slice(0, i) + segment.charAt(i).toUpperCase() + segment.slice(i + 1);
}

function titleWord(word: string, index: number): string {
  const lower = word.toLowerCase();
  if (index > 0 && SMALL_WORDS.has(lower)) return lower;
  // "12oz" / "oz" stay lowercase units.
  const unit = lower.match(/^(\d*[.,]?\d*)([a-z]+)\.?$/);
  if (unit && UNIT_WORDS.has(unit[2]) && (unit[1] !== '' || index > 0)) return lower;
  // M&M's, A&W: capitalize each side of "&"; Sugar-Free: each side of "-" or "/".
  return lower
    .split(/([&\-/])/)
    .map((part) => (/^[&\-/]$/.test(part) ? part : capitalizeSegment(part)))
    .join('');
}

/** Title-case a name when it is ALL CAPS or all lowercase; mixed-case names are kept as written. */
export function tidyProductName(raw: string): string {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) return name;
  const hasUpper = /\p{Lu}/u.test(name);
  const hasLower = /\p{Ll}/u.test(name);
  if (hasUpper && hasLower) return name;
  return name
    .split(' ')
    .map((w, i) => titleWord(w, i))
    .join(' ');
}

const str = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Pick the display name from an Open Food Facts product object. Specific fields first (product_name_en,
 * product_name, abbreviated_product_name); a candidate that just repeats the generic name or a category is
 * skipped while a more specific one exists. Returns '' when the product has no usable text.
 */
export function pickProductName(product: Record<string, unknown>): string {
  const specific = [product.product_name_en, product.product_name, product.abbreviated_product_name].map(str).filter(Boolean);
  const generic = [product.generic_name_en, product.generic_name].map(str).filter(Boolean);
  const categories = str(product.categories)
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
  const genericKeys = new Set([...generic, ...categories].map(norm));
  const chosen = specific.find((s) => !genericKeys.has(norm(s))) ?? specific[0] ?? generic[0] ?? '';
  return tidyProductName(chosen);
}

/** First brand from OFF's comma-separated `brands`, tidied the same way. */
export function pickBrand(product: Record<string, unknown>): string {
  return tidyProductName(str(product.brands).split(',')[0] ?? '');
}
