import { createRecipe } from '@/lib/recipe-utils';
import { LEGACY_SAMPLE_CREATED_AT } from '@/storage/legacy-samples';
import type { Recipe, RecipeInput } from '@/types/recipe';

/**
 * Test fixtures: the two sample recipes builds up to v1.0.0 seeded on first launch. The app no longer seeds
 * anything (v1.0.1) and `src/storage/legacy-samples.ts` removes untouched v1.0.0 copies on launch, so these use
 * a different `createdAt` than the shipped seeds and survive that cleanup. Use `asLegacySample` to get a copy
 * exactly as v1.0.0 stored it.
 * Built through createRecipe so ingredients are parsed + step timers detected. Diabetic-friendly, allulose only.
 */
export const SAMPLE_CREATED_AT = '2026-10-01T00:00:00.000Z';

const SAMPLE_INPUTS: (RecipeInput & { id: string })[] = [
  {
    id: 'seed-lemon-herb-chicken',
    title: 'Lemon Herb Chicken Thighs',
    description: 'Crispy-skinned sheet-pan chicken with green beans.',
    ingredients: [
      { text: '6 bone-in, skin-on chicken thighs' },
      { text: '2 tbsp olive oil' },
      { text: '1 lemon, zested and juiced' },
      { text: '3 cloves garlic, minced' },
      { text: '1 tsp dried thyme' },
      { text: '1 lb green beans, trimmed' },
      { text: 'Salt and pepper to taste' },
    ],
    steps: [
      { text: 'Heat oven to 425°F (220°C).' },
      { text: 'Toss chicken with oil, lemon zest and juice, garlic, thyme, salt and pepper.' },
      { text: 'Arrange skin-side up on a sheet pan with the green beans around it.' },
      { text: 'Roast 35–40 minutes until the chicken reaches 175°F (80°C) and the skin is crisp.' },
    ],
    tags: ['dinner', 'diabetic-friendly', 'sheet-pan'],
    servings: 6,
  },
  {
    id: 'seed-allulose-cheesecake-mousse',
    title: 'Allulose Vanilla Cheesecake Mousse',
    description: 'No-bake dessert sweetened only with allulose.',
    ingredients: [
      { text: '8 oz cream cheese, softened' },
      { text: '1 cup heavy cream, cold' },
      { text: '1/3 cup powdered allulose' },
      { text: '1 tsp vanilla extract' },
      { text: '1 tsp lemon juice' },
      { text: 'Pinch of salt' },
    ],
    steps: [
      { text: 'Beat cream cheese, allulose, vanilla, lemon juice and salt until smooth.' },
      { text: 'In a separate bowl whip the cream to stiff peaks.' },
      { text: 'Fold the whipped cream into the cream cheese mixture.' },
      { text: 'Spoon into 6 cups and chill at least 1 hour.' },
    ],
    tags: ['dessert', 'diabetic-friendly', 'allulose', 'no-bake'],
    servings: 6,
  },
];

export const SAMPLE_RECIPES: Recipe[] = SAMPLE_INPUTS.map(({ id, ...input }) =>
  createRecipe(input, new Date(SAMPLE_CREATED_AT), id),
);

/** A copy exactly as v1.0.0 seeded it (shipped createdAt), for the cleanup tests. */
export function asLegacySample(r: Recipe, id: string): Recipe {
  return { ...(JSON.parse(JSON.stringify(r)) as Recipe), id, createdAt: LEGACY_SAMPLE_CREATED_AT };
}

/** Save the sample recipes (fresh copies, same ids) into a recipe store — what tests used `seedIfNeeded` for. */
export async function addSampleRecipes(store: { save: (r: Recipe) => Promise<Recipe> }): Promise<Recipe[]> {
  const saved: Recipe[] = [];
  for (const r of SAMPLE_RECIPES) saved.push(await store.save(JSON.parse(JSON.stringify(r)) as Recipe));
  return saved;
}
