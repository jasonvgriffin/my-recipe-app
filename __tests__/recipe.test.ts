import { createRecipe, parseLines, parseTags, searchRecipes } from '@/lib/recipe-utils';
import { SAMPLE_RECIPES } from '../test-helpers/sample-recipes';
import { isRecipe, validateRecipeInput, type RecipeInput } from '@/types/recipe';

const base: RecipeInput = {
  title: 'Test Recipe',
  ingredients: [{ text: '1 cup almond flour' }, { text: '2 tbsp allulose' }],
  steps: [{ text: 'Mix' }, { text: 'Bake 20 minutes' }],
  tags: ['dessert'],
  servings: 4,
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
    });
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(4);
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
    expect(parseTags('Weeknight, dinner,weeknight\nFamily')).toEqual(['weeknight', 'dinner', 'family']);
  });

  it('creates a normalized recipe', () => {
    const r = createRecipe({ ...base, title: '  Spaced  ', tags: ['A', 'a'] }, new Date('2026-01-01T00:00:00Z'), 'id1');
    expect(r).toMatchObject({ id: 'id1', title: 'Spaced', tags: ['a'], createdAt: '2026-01-01T00:00:00.000Z' });
    expect(isRecipe(r)).toBe(true);
  });

  it('searches title, ingredients, notes and tags (spec #8)', () => {
    const withNotes = { ...SAMPLE_RECIPES[0], notes: 'serve with a side salad' };
    expect(searchRecipes([withNotes, SAMPLE_RECIPES[1]], 'side salad')).toHaveLength(1);
    expect(searchRecipes(SAMPLE_RECIPES, 'chicken')).toHaveLength(1);
    expect(searchRecipes(SAMPLE_RECIPES, 'thyme')).toHaveLength(1);
    expect(searchRecipes(SAMPLE_RECIPES, 'no-bake')).toHaveLength(1);
    expect(searchRecipes(SAMPLE_RECIPES, 'allulose')).toHaveLength(1);
    expect(searchRecipes(SAMPLE_RECIPES, '')).toHaveLength(2);
  });

  it('seed recipes are valid and monk-fruit free', () => {
    for (const r of SAMPLE_RECIPES) {
      expect(isRecipe(r)).toBe(true);
      expect(validateRecipeInput(r).ok).toBe(true);
    }
  });
});
