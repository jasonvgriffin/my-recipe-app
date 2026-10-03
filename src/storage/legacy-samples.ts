import type { Recipe } from '@/types/recipe';

/**
 * Builds up to v1.0.0 inserted two sample recipes on first launch. v1.0.1 seeds nothing and removes those
 * samples from existing installs, but ONLY while they are untouched: same title, ingredient lines, steps,
 * tags and servings as shipped, the shipped `createdAt`, and no rating, cook history, notes, photo, source,
 * categories or edits. Anything the user changed (or wrote) is a user recipe and is never deleted.
 */
export const LEGACY_SAMPLE_CREATED_AT = '2026-10-02T00:00:00.000Z';

interface SampleFingerprint {
  title: string;
  ingredients: string[];
  steps: string[];
  tags: string[];
  servings: number;
}

export const LEGACY_SAMPLES: SampleFingerprint[] = [
  {
    title: 'Lemon Herb Chicken Thighs',
    ingredients: [
      '6 bone-in, skin-on chicken thighs',
      '2 tbsp olive oil',
      '1 lemon, zested and juiced',
      '3 cloves garlic, minced',
      '1 tsp dried thyme',
      '1 lb green beans, trimmed',
      'Salt and pepper to taste',
    ],
    steps: [
      'Heat oven to 425°F (220°C).',
      'Toss chicken with oil, lemon zest and juice, garlic, thyme, salt and pepper.',
      'Arrange skin-side up on a sheet pan with the green beans around it.',
      'Roast 35–40 minutes until the chicken reaches 175°F (80°C) and the skin is crisp.',
    ],
    tags: ['dinner', 'diabetic-friendly', 'sheet-pan'],
    servings: 6,
  },
  {
    title: 'Allulose Vanilla Cheesecake Mousse',
    ingredients: [
      '8 oz cream cheese, softened',
      '1 cup heavy cream, cold',
      '1/3 cup powdered allulose',
      '1 tsp vanilla extract',
      '1 tsp lemon juice',
      'Pinch of salt',
    ],
    steps: [
      'Beat cream cheese, allulose, vanilla, lemon juice and salt until smooth.',
      'In a separate bowl whip the cream to stiff peaks.',
      'Fold the whipped cream into the cream cheese mixture.',
      'Spoon into 6 cups and chill at least 1 hour.',
    ],
    tags: ['dessert', 'diabetic-friendly', 'allulose', 'no-bake'],
    servings: 6,
  },
];

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** True only for an untouched copy of a v1.0.0 sample recipe. */
export function isUntouchedLegacySample(r: Recipe): boolean {
  if (r.createdAt !== LEGACY_SAMPLE_CREATED_AT) return false;
  if (r.rating || r.cooked || r.cookHistory.length > 0 || r.lastCookedAt) return false;
  if (r.notes || r.photoUri || r.sourceUrl || r.categoryIds.length > 0 || r.unitSystem) return false;
  return LEGACY_SAMPLES.some(
    (s) =>
      r.title === s.title &&
      r.servings === s.servings &&
      sameList(r.tags, s.tags) &&
      sameList(
        r.ingredients.map((i) => i.text),
        s.ingredients,
      ) &&
      r.ingredients.every((i) => !i.substitutionNote) &&
      sameList(
        r.steps.map((st) => st.text),
        s.steps,
      ),
  );
}
