import type { Ingredient, UnitSystem } from '@/types/recipe';

import { convertAmount, findUnit, getUnit, roundNice } from './units';

const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

/** Parse "2", "1/2", "2 1/2", "1½", "0.5" → number. */
function parseNumber(s: string): number | undefined {
  const t = s.trim().replace(/([0-9])([¼½¾⅓⅔⅛⅜⅝⅞])/g, '$1 $2');
  let total = 0;
  let any = false;
  for (const part of t.split(/\s+/)) {
    if (UNICODE_FRACTIONS[part] !== undefined) total += UNICODE_FRACTIONS[part];
    else if (/^\d+\/\d+$/.test(part)) {
      const [a, b] = part.split('/').map(Number);
      if (!b) return undefined;
      total += a / b;
    } else if (/^\d+(\.\d+)?$/.test(part)) total += Number(part);
    else return undefined;
    any = true;
  }
  return any ? total : undefined;
}

const NUM = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d*\s*[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?)`;
const QTY_RE = new RegExp(String.raw`^(${NUM})(?:\s*(?:-|–|to)\s*(${NUM}))?\s*`);

/**
 * Parse an ingredient line into { quantity, quantityMax, unit, name, note } (best effort).
 * "2 1/2 tbsp allulose, powdered" → { quantity: 2.5, unit: 'tbsp', name: 'allulose', note: 'powdered' }.
 * Always keeps the original `text`.
 */
export function parseIngredient(text: string): Ingredient {
  const original = text.trim();
  let rest = original;
  const out: Ingredient = { text: original };
  const q = rest.match(QTY_RE);
  if (q) {
    const quantity = parseNumber(q[1]);
    if (quantity !== undefined) {
      out.quantity = quantity;
      const max = q[2] ? parseNumber(q[2]) : undefined;
      if (max !== undefined) out.quantityMax = max;
      rest = rest.slice(q[0].length);
    }
  }
  if (out.quantity !== undefined) {
    // Try two-word units first ("fl oz"), then one word.
    const words = rest.split(/\s+/);
    for (const n of [2, 1]) {
      const candidate = words.slice(0, n).join(' ');
      const unit = candidate && findUnit(candidate);
      if (unit) {
        out.unit = unit.id;
        rest = words.slice(n).join(' ');
        break;
      }
    }
    rest = rest.replace(/^of\s+/i, '');
  }
  // Note: text after the first comma, or in parentheses.
  let name = rest;
  const notes: string[] = [];
  name = name.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    notes.push(inner.trim());
    return '';
  });
  const comma = name.indexOf(',');
  if (comma >= 0) {
    notes.push(name.slice(comma + 1).trim());
    name = name.slice(0, comma);
  }
  name = name.replace(/\s+/g, ' ').trim();
  if (name) out.name = name.toLowerCase();
  const note = notes.filter(Boolean).join('; ');
  if (note) out.note = note;
  return out;
}

/** Scale an ingredient by a factor (e.g. 2 for double servings). Unparsed lines are unchanged. */
export function scaleIngredient(ing: Ingredient, factor: number): Ingredient {
  if (ing.quantity === undefined || factor === 1) return ing;
  return {
    ...ing,
    quantity: roundNice(ing.quantity * factor),
    quantityMax: ing.quantityMax !== undefined ? roundNice(ing.quantityMax * factor) : undefined,
  };
}

/** Convert an ingredient's amount to metric/imperial (spec #16). Unparsed or count units unchanged. */
export function convertIngredient(ing: Ingredient, target: UnitSystem): Ingredient {
  if (ing.quantity === undefined || !ing.unit) return ing;
  const lo = convertAmount(ing.quantity, ing.unit, target);
  const hi = ing.quantityMax !== undefined ? convertAmount(ing.quantityMax, ing.unit, target) : undefined;
  return { ...ing, quantity: lo.quantity, unit: lo.unit, quantityMax: hi?.unit === lo.unit ? hi.quantity : undefined };
}

export function formatQuantity(q: number): string {
  const whole = Math.floor(q);
  const frac = q - whole;
  const nice: [number, string][] = [
    [0.25, '¼'],
    [1 / 3, '⅓'],
    [0.5, '½'],
    [2 / 3, '⅔'],
    [0.75, '¾'],
  ];
  const match = nice.find(([v]) => Math.abs(v - frac) < 0.02);
  if (match) return whole ? `${whole}${match[1]}` : match[1];
  return String(roundNice(q));
}

/**
 * Render an ingredient for display. If it was parsed, rebuilds "qty unit name, note"
 * (so scaling/conversion show), otherwise returns the original text.
 */
export function formatIngredient(ing: Ingredient): string {
  if (ing.quantity === undefined || !ing.name) return ing.text;
  const qty =
    formatQuantity(ing.quantity) + (ing.quantityMax !== undefined ? `–${formatQuantity(ing.quantityMax)}` : '');
  const unit = getUnit(ing.unit);
  const plural = unit?.dimension === 'count' && (ing.quantityMax ?? ing.quantity) > 1;
  const unitLabel = ing.unit
    ? plural
      ? /(ch|sh|s)$/.test(ing.unit)
        ? `${ing.unit}es`
        : `${ing.unit}s`
      : ing.unit
    : '';
  return [qty, unitLabel, ing.name].filter(Boolean).join(' ') + (ing.note ? `, ${ing.note}` : '');
}

/** Key used to merge shopping-list lines and match the pantry. */
export function ingredientKey(ing: Ingredient): string {
  return (ing.name ?? ing.text)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
