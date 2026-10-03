import { createRecipe, parseLines, parseTags, searchRecipes } from '@/lib/recipe-utils';
import { SEED_RECIPES } from '@/data/seed';
import { isLowCarb, isRecipe, validateRecipeInput, type RecipeInput } from '@/types/recipe';

const base: RecipeInput = {
  title: 'Test Recipe',
  ingredients: [{ text: '1 cup almond flour' }, { text: '2 tbsp allulose' }],
  steps: [{ text: 'Mix' }, { text: 'Bake 20 minutes' }],
  tags: ['dessert'],
  servings: 4,
  nutrition: { netCarbsG: 3 },
};

describe('validateRecipeInput', () => {
  it('accepts a valid recipe', () => {
    expect(validateRecipeInput(base)).toEqual({ ok: true, errors: [] });
  });

  it('requires title, ingredients, steps and sane numbers', () => {
    const r = validateRecipeInput({
      ...base,
      title: ' ',
      ingredients: [],
      steps: [],
      servings: 0,
      nutrition: { netCarbsG: NaN },
    });
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(5);
  });

  it.each(['1 tbsp monk fruit sweetener', 'Monk-fruit blend', 'luo han guo extract'])(
    'rejects forbidden sweetener: %s',
    (text) => {
      const r = validateRecipeInput({ ...base, ingredients: [{ text }] });
      expect(r.ok).toBe(false);
      expect(r.errors.join(' ')).toMatch(/allulose/);
    },
  );
});

describe('recipe utils', () => {
  it('parses lines and tags', () => {
    expect(parseLines(' a \n\n b\r\nc ')).toEqual(['a', 'b', 'c']);
    expect(parseTags('Low-Carb, dinner,low-carb\nKeto')).toEqual(['low-carb', 'dinner', 'keto']);
  });

  it('creates a normalized recipe', () => {
    const r = createRecipe({ ...base, title: '  Spaced  ', tags: ['A', 'a'] }, new Date('2026-01-01T00:00:00Z'), 'id1');
    expect(r).toMatchObject({ id: 'id1', title: 'Spaced', tags: ['a'], createdAt: '2026-01-01T00:00:00.000Z' });
    expect(isRecipe(r)).toBe(true);
  });

  it('searches by title, tag and ingredient', () => {
    expect(searchRecipes(SEED_RECIPES, 'chicken')).toHaveLength(1);
    expect(searchRecipes(SEED_RECIPES, 'dessert')).toHaveLength(1);
    expect(searchRecipes(SEED_RECIPES, 'allulose')).toHaveLength(1);
    expect(searchRecipes(SEED_RECIPES, '')).toHaveLength(2);
  });

  it('seed recipes are valid, low-carb and monk-fruit free', () => {
    for (const r of SEED_RECIPES) {
      expect(isRecipe(r)).toBe(true);
      expect(isLowCarb(r)).toBe(true);
      expect(validateRecipeInput(r).ok).toBe(true);
    }
  });
});
