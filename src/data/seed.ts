import { createRecipe } from '@/lib/recipe-utils';
import type { Recipe, RecipeInput } from '@/types/recipe';

const SEED_TS = '2026-10-02T00:00:00.000Z';

/** Sample recipes (built through createRecipe so ingredients are parsed + step timers detected) inserted on first launch. Diabetic-friendly, allulose only. */
const SEED_INPUTS: (RecipeInput & { id: string })[] = [
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

export const SEED_RECIPES: Recipe[] = SEED_INPUTS.map(({ id, ...input }) => createRecipe(input, new Date(SEED_TS), id));
