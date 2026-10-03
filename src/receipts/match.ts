import { ingredientKey } from '@/lib/ingredients';
import type { PantryItem } from '@/types/recipe';

import { parseReceipt } from './parseReceipt';
import type { LearnedAlias, ReceiptLineItem, ReceiptMatchKind, ReviewLine } from './types';

/** Store-brand codes stripped before matching. The words themselves are not food. */
const BRAND_TOKENS = new Set(['gv', 'kro', 'ks']);

/** Common grocery-receipt abbreviations → words. Allulose is the only sugar-free sweetener we expand toward. */
const ABBREVIATIONS: Record<string, string> = {
  bnls: 'boneless',
  bnless: 'boneless',
  chkn: 'chicken',
  chx: 'chicken',
  chix: 'chicken',
  brst: 'breast',
  brsts: 'breasts',
  thgh: 'thigh',
  thghs: 'thighs',
  org: 'organic',
  flr: 'flour',
  pwdr: 'powder',
  pwd: 'powdered',
  crm: 'cream',
  chse: 'cheese',
  chz: 'cheese',
  grn: 'green',
  wht: 'white',
  blck: 'black',
  almnd: 'almond',
  almd: 'almond',
  unswt: 'unsweetened',
  frz: 'frozen',
  frzn: 'frozen',
  veg: 'vegetable',
  btr: 'butter',
  ylw: 'yellow',
  hvy: 'heavy',
  whl: 'whole',
  mlk: 'milk',
  yog: 'yogurt',
  grnd: 'ground',
  slcd: 'sliced',
  shrd: 'shredded',
  clflr: 'cauliflower',
  broc: 'broccoli',
};

const FUZZY_THRESHOLD = 0.66;

/** Lowercase, drop prices and punctuation. Stable key for the learned alias table. */
export function normalizeAlias(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\$?\d+\.\d{2}/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Expand receipt shorthand and drop store-brand codes ("gv bnls chkn" → "boneless chicken"). */
export function expandGroceryName(raw: string): string {
  return normalizeAlias(raw)
    .split(' ')
    .filter((token) => token && !BRAND_TOKENS.has(token))
    .map((token) => ABBREVIATIONS[token] ?? token)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(name: string): string[] {
  return expandGroceryName(name)
    .split(' ')
    .filter((token) => token.length > 1);
}

/** Dice coefficient over expanded tokens. 1 = the same words. */
export function groceryNameScore(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.length === 0 || right.length === 0) return 0;
  const used = new Set<number>();
  let shared = 0;
  for (const token of left) {
    const index = right.findIndex((other, i) => {
      if (used.has(i)) return false;
      if (other === token) return true;
      if (token.length > 3 && other.length > 3 && (other.startsWith(token) || token.startsWith(other))) return true;
      return false;
    });
    if (index >= 0) {
      used.add(index);
      shared += 1;
    }
  }
  return (2 * shared) / (left.length + right.length);
}

export interface LineMatch {
  name: string;
  match: ReceiptMatchKind;
  pantryItemId?: string;
}

/**
 * Match one receipt line to the pantry: learned alias, then exact name, then fuzzy.
 * No match → a new item named with abbreviations expanded.
 */
export function matchReceiptLine(
  line: Pick<ReceiptLineItem, 'rawText' | 'name'>,
  pantry: readonly PantryItem[],
  aliases: readonly LearnedAlias[],
): LineMatch {
  const aliasKey = normalizeAlias(line.name);
  const rawKey = normalizeAlias(line.rawText);
  const learned = aliases.find((alias) => alias.alias === aliasKey || alias.alias === rawKey);
  if (learned) {
    const hit = pantry.find((item) => ingredientKey({ text: item.name }) === ingredientKey({ text: learned.name }));
    return {
      name: ingredientKey({ text: learned.name }) || learned.name,
      match: 'alias',
      ...(hit ? { pantryItemId: hit.id } : {}),
    };
  }

  const expanded = expandGroceryName(line.name) || line.name;
  const expandedKey = ingredientKey({ text: expanded });
  const exact = pantry.find((item) => ingredientKey({ text: item.name }) === expandedKey);
  if (exact) return { name: exact.name, match: 'exact', pantryItemId: exact.id };

  let best: { item: PantryItem; score: number } | undefined;
  for (const item of pantry) {
    const score = groceryNameScore(expanded, item.name);
    if (!best || score > best.score) best = { item, score };
  }
  if (best && best.score >= FUZZY_THRESHOLD) {
    return { name: best.item.name, match: 'fuzzy', pantryItemId: best.item.id };
  }
  return { name: expandedKey || expanded, match: 'new' };
}

/** Parse OCR text and attach a pantry match to each line for the review screen. */
export function buildReceiptReview(
  ocrText: string,
  pantry: readonly PantryItem[],
  aliases: readonly LearnedAlias[] = [],
): ReviewLine[] {
  return parseReceipt(ocrText).map((line, index) => {
    const matched = matchReceiptLine(line, pantry, aliases);
    return {
      id: `line-${index + 1}`,
      rawText: line.rawText,
      parsedName: line.name,
      name: matched.name,
      quantity: line.quantity,
      unit: line.unit,
      price: line.price,
      skipped: false,
      pantryItemId: matched.pantryItemId,
      match: matched.match,
      suggestedName: matched.name,
    };
  });
}
