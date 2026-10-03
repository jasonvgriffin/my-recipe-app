import { SEED_RECIPES } from '@/data/seed';
import { convertIngredient, formatIngredient, parseIngredient, scaleIngredient } from '@/lib/ingredients';
import { rankRecipesByPantry } from '@/lib/pantry';
import { createRecipe, filterRecipes, setRating, sortRecipes } from '@/lib/recipe-utils';
import { compileItems } from '@/lib/shopping';
import { detectStepDuration, formatDuration } from '@/lib/timers';
import { migrateRecipe, netCarbs, type PantryItem } from '@/types/recipe';

describe('ingredient parsing / scaling / conversion (spec #16, #12)', () => {
  it.each([
    ['2 1/2 tbsp allulose, powdered', { quantity: 2.5, unit: 'tbsp', name: 'allulose', note: 'powdered' }],
    ['1½ cups almond flour', { quantity: 1.5, unit: 'cup', name: 'almond flour' }],
    ['2-3 cloves garlic, minced', { quantity: 2, quantityMax: 3, unit: 'clove', name: 'garlic', note: 'minced' }],
    ['8 oz cream cheese (softened)', { quantity: 8, unit: 'oz', name: 'cream cheese', note: 'softened' }],
    ['500 g chicken thighs', { quantity: 500, unit: 'g', name: 'chicken thighs' }],
    ['6 eggs', { quantity: 6, name: 'eggs' }],
    ['Salt and pepper to taste', { name: 'salt and pepper to taste' }],
  ])('parses %s', (text, expected) => {
    expect(parseIngredient(text)).toEqual({ text, ...expected });
  });

  it('scales and converts', () => {
    const flour = parseIngredient('1 cup almond flour');
    expect(scaleIngredient(flour, 1.5).quantity).toBe(1.5);
    expect(convertIngredient(flour, 'metric')).toMatchObject({ quantity: 237, unit: 'ml' });
    expect(convertIngredient(parseIngredient('1 lb green beans'), 'metric')).toMatchObject({ quantity: 454, unit: 'g' });
    expect(convertIngredient(parseIngredient('500 g chicken'), 'imperial')).toMatchObject({ quantity: 1.1, unit: 'lb' });
    expect(convertIngredient(parseIngredient('3 cloves garlic'), 'metric').unit).toBe('clove');
    expect(formatIngredient(scaleIngredient(parseIngredient('1/2 cup allulose'), 0.5))).toBe('¼ cup allulose');
  });
});

describe('step timers (spec #15)', () => {
  it.each([
    ['Roast 35–40 minutes until crisp', 2400],
    ['Simmer 1 hour 15 minutes', 4500],
    ['Rest for 30 sec', 30],
    ['Season to taste', undefined],
  ])('%s → %s', (text, secs) => expect(detectStepDuration(text)).toBe(secs));

  it('formats durations and detects them when recipes are created', () => {
    expect(formatDuration(4500)).toBe('1:15:00');
    expect(formatDuration(90)).toBe('1:30');
    expect(SEED_RECIPES[0].steps[3].durationSeconds).toBe(2400);
  });
});

describe('nutrition (spec #17)', () => {
  it('computes net carbs from carbs - fiber only when needed', () => {
    expect(netCarbs({ netCarbsG: 4 })).toBe(4);
    expect(netCarbs({ carbsG: 10, fiberG: 6 })).toBe(4);
    expect(netCarbs({ carbsG: 10 })).toBeUndefined();
  });

  it('migrates v2 recipes (string steps, carbsPerServing)', () => {
    const v2 = { ...SEED_RECIPES[0], schemaVersion: 2, steps: ['Bake 10 minutes'], carbsPerServing: 5, nutrition: undefined };
    const r = migrateRecipe(v2)!;
    expect(r.steps).toEqual([{ text: 'Bake 10 minutes' }]);
    expect(r.nutrition).toEqual({ netCarbsG: 5, source: 'manual' });
    expect('carbsPerServing' in r).toBe(false);
  });
});

describe('ratings + tags (spec #20, #22)', () => {
  it('sorts and filters by rating and tags', () => {
    const [a, b] = SEED_RECIPES;
    const rated = [setRating(a, 3), setRating(b, 5)];
    expect(sortRecipes(rated, 'rating').map((r) => r.rating)).toEqual([5, 3]);
    expect(filterRecipes(rated, { minRating: 4 })).toHaveLength(1);
    expect(filterRecipes(rated, { tags: ['dessert', 'low-carb'] }).map((r) => r.id)).toEqual([b.id]);
    expect(setRating(a, 9).rating).toBe(5);
    expect(sortRecipes(rated, 'netCarbs')[0].id).toBe(b.id);
  });
});

describe('shopping merge, grocery run, pantry (spec #12, #18, #21)', () => {
  const r1 = createRecipe({
    title: 'A', servings: 2, tags: [], steps: [{ text: 'x' }],
    ingredients: [{ text: '1 cup almond flour' }, { text: '2 tbsp allulose' }, { text: '2 eggs' }],
  });
  const r2 = createRecipe({
    title: 'B', servings: 4, tags: [], steps: [{ text: 'y' }],
    ingredients: [{ text: '1 tbsp allulose' }, { text: '1/2 cup almond flour' }, { text: '1 tsp salt' }],
  });

  it('merges quantities, scales by planned servings and skips pantry items', () => {
    const pantry: PantryItem[] = [{ id: 'p1', name: 'Salt', updatedAt: '' }];
    const items = compileItems([{ recipe: r1, servings: 4 }, { recipe: r2 }], { pantry });
    const texts = items.map((i) => i.text).sort();
    expect(texts).toEqual(['2½ cup almond flour', '4 eggs', '5 tbsp allulose']);
  });

  it('ranks recipes by ingredients on hand', () => {
    const pantry: PantryItem[] = [
      { id: '1', name: 'almond flour', updatedAt: '' },
      { id: '2', name: 'allulose', updatedAt: '' },
      { id: '3', name: 'salt', updatedAt: '' },
    ];
    const ranked = rankRecipesByPantry([r1, r2], pantry);
    expect(ranked[0]).toMatchObject({ recipe: { id: r2.id }, have: 3, total: 3, missing: [] });
    expect(ranked[1]).toMatchObject({ have: 2, missing: ['eggs'] });
  });
});
