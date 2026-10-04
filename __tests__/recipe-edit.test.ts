import { createRecipe } from '@/lib/recipe-utils';
import { applyRecipeEdit, editorStateToInput, moveItem, recipeToEditorState, secondsToMinutes } from '@/lib/recipe-edit';
import type { Recipe } from '@/types/recipe';

function sample(): Recipe {
  return createRecipe(
    {
      title: 'Lemon chicken',
      ingredients: [
        { text: '6 chicken thighs' },
        { text: '1 tbsp olive oil', substitutionNote: 'avocado oil if needed' },
      ],
      steps: [
        { text: 'Heat the oven.' },
        { text: 'Roast 35 minutes.', durationSeconds: 35 * 60 },
      ],
      tags: ['dinner'],
      servings: 4,
      notes: 'Crispy skin.',
      sourceUrl: 'https://example.com/chicken',
    },
    new Date('2026-10-02T00:00:00Z'),
    'recipe-1',
  );
}

describe('recipe editor model (spec #2, #6, #7)', () => {
  it('round-trips title, notes, substitution and step minutes', () => {
    const recipe = { ...sample(), cooked: true, lastCookedAt: '2026-10-01T00:00:00.000Z', rating: 4 as const };
    const state = recipeToEditorState(recipe);
    expect(state.title).toBe('Lemon chicken');
    expect(state.notes).toBe('Crispy skin.');
    expect(state.ingredients[1].substitutionNote).toBe('avocado oil if needed');
    expect(state.steps[1].minutes).toBe('35');
    expect(secondsToMinutes(90)).toBe('1.5');

    state.title = '  Lemon herb chicken  ';
    state.notes = 'Rest 5 minutes.';
    state.ingredients = moveItem(state.ingredients, 1, -1);
    state.ingredients[0].substitutionNote = 'allulose is not in this one';
    state.steps = moveItem(state.steps, 0, 1);
    state.steps[0].minutes = '40';

    const built = editorStateToInput(state, recipe);
    if (!built.ok) throw new Error(built.errors.join());
    const saved = applyRecipeEdit(recipe, built.input, new Date('2026-10-03T00:00:00Z'));
    expect(saved.title).toBe('Lemon herb chicken');
    expect(saved.notes).toBe('Rest 5 minutes.');
    expect(saved.ingredients.map((i) => i.text)).toEqual(['1 tbsp olive oil', '6 chicken thighs']);
    expect(saved.ingredients[0].substitutionNote).toBe('allulose is not in this one');
    expect(saved.steps.map((s) => s.text)).toEqual(['Roast 35 minutes.', 'Heat the oven.']);
    expect(saved.steps[0].durationSeconds).toBe(40 * 60);
    expect(saved.id).toBe(recipe.id);
    expect(saved.createdAt).toBe(recipe.createdAt);
    expect(saved.cooked).toBe(true);
    expect(saved.lastCookedAt).toBe(recipe.lastCookedAt);
    expect(saved.rating).toBe(4);
    expect(saved.tags).toEqual(['dinner']);
    expect(saved.sourceUrl).toBe('https://example.com/chicken');
  });

  it('keeps author and any legacy sync meta (SyncMeta) when a synced recipe is edited', () => {
    const recipe: Recipe = {
      ...sample(),
      householdId: 'house-1',
      createdBy: 'user-a',
      cooked: true,
      cookHistory: ['2026-09-01T12:00:00.000Z'],
    };
    const state = recipeToEditorState(recipe);
    state.title = 'Edited by someone else';
    const built = editorStateToInput(state, recipe);
    if (!built.ok) throw new Error(built.errors.join());
    const saved = applyRecipeEdit(recipe, built.input, new Date('2026-10-03T00:00:00Z'));
    expect(saved.householdId).toBe('house-1');
    expect(saved.createdBy).toBe('user-a');
    expect(saved.cookHistory).toEqual(recipe.cookHistory);
    expect(saved.title).toBe('Edited by someone else');
  });

  it('rejects monk fruit', () => {
    const recipe = sample();
    const state = recipeToEditorState(recipe);

    state.ingredients[0].text = '1 tsp monk fruit';
    const forbidden = editorStateToInput(state, recipe);
    expect(forbidden.ok).toBe(false);
    if (forbidden.ok) return;
    expect(forbidden.errors.join(' ')).toMatch(/allulose/i);
  });

  it('rejects a bad timer and a bad source link', () => {
    const recipe = sample();
    const state = recipeToEditorState(recipe);
    state.steps[0].minutes = '0';
    state.sourceUrl = 'not a url';
    const result = editorStateToInput(state, recipe);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => /timer/i.test(e))).toBe(true);
    expect(result.errors.some((e) => /source link/i.test(e))).toBe(true);
  });

  it('does not move an item past the ends', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});

describe('recipeStore.removeUntouchedSamples', () => {
  it('runs once even when called concurrently', async () => {
    const { createRecipeStore } = require('@/storage/recipes');
    const data = new Map<string, string>();
    const store = createRecipeStore({
      getItem: async (k: string) => data.get(k) ?? null,
      setItem: async (k: string, v: string) => void data.set(k, v),
      removeItem: async (k: string) => void data.delete(k),
    });
    const { SAMPLE_RECIPES, asLegacySample } = require('../test-helpers/sample-recipes');
    for (const r of SAMPLE_RECIPES) await store.save(asLegacySample(r, r.id));
    const counts = await Promise.all([
      store.removeUntouchedSamples(),
      store.removeUntouchedSamples(),
      store.removeUntouchedSamples(),
    ]);
    expect(counts).toEqual([2, 2, 2]); // coalesced into one run
    expect(await store.removeUntouchedSamples()).toBe(0);
    expect(await store.list()).toHaveLength(0);
  });
});
