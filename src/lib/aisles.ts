/**
 * Grocery aisles for run mode (spec #18). First matching rule wins.
 * Allulose is the only sugar-free sweetener we recognize; it lives with pantry staples.
 */
export const AISLES = [
  'Produce',
  'Meat & seafood',
  'Dairy & eggs',
  'Frozen',
  'Bakery',
  'Pantry',
  'Spices',
  'Beverages',
  'Other',
] as const;

export type Aisle = (typeof AISLES)[number];

const AISLE_SET = new Set<string>(AISLES);

const RULES: readonly [Aisle, RegExp][] = [
  ['Frozen', /\b(frozen|ice)\b/i],
  ['Bakery', /\b(bread|tortilla|bagel|bun|roll|pita)\b/i],
  ['Beverages', /\b(coffee|tea|broth|stock|soda|water|juice)\b/i],
  [
    'Spices',
    /\b(salt|pepper|peppercorn|thyme|paprika|cumin|cinnamon|vanilla|oregano|rosemary|chili|cayenne|spice|seasoning|garlic powder|onion powder)\b/i,
  ],
  [
    'Produce',
    /\b(lettuce|spinach|kale|arugula|broccoli|cauliflower|zucchini|asparagus|cucumber|tomato|mushroom|basil|cilantro|parsley|cabbage|celery|avocado|lemon|lime|onion|garlic|green beans|bell pepper|jalape[nñ]o|herb|apple|berry|berries)\b/i,
  ],
  [
    'Meat & seafood',
    /\b(chicken|beef|pork|turkey|salmon|tuna|shrimp|bacon|sausage|thighs?|steak|fish|lamb|ground)\b/i,
  ],
  ['Dairy & eggs', /\b(eggs?|cream cheese|heavy cream|butter|cheese|yogurt|milk|cream)\b/i],
  [
    'Pantry',
    /\b(almond flour|coconut flour|allulose|olive oil|avocado oil|oil|vinegar|almond|walnut|pecan|cocoa|flour|baking powder)\b/i,
  ],
];

/** Classify a shopping line (original text and/or parsed name) into an aisle. */
export function aisleForIngredient(text: string): Aisle {
  const hay = text.trim();
  if (!hay) return 'Other';
  for (const [aisle, re] of RULES) if (re.test(hay)) return aisle;
  return 'Other';
}

export function normalizeAisle(value: string | undefined, fallbackText: string): Aisle {
  if (value && AISLE_SET.has(value)) return value as Aisle;
  return aisleForIngredient(fallbackText);
}
