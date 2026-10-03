import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { createRecipe } from '@/lib/recipe-utils';
import { recipeStore } from '@/storage/recipes';

jest.mock('@/lib/photos', () => ({
  downloadRecipePhoto: jest.fn(async () => 'file:///docs/recipe-photos/imported.jpg'),
  pickRecipePhoto: jest.fn(async () => 'file:///docs/recipe-photos/picked.jpg'),
  deleteLocalPhoto: jest.fn(),
  persistRecipePhoto: jest.fn(),
  downloadSharePhoto: jest.fn(async () => 'file:///cache/share.jpg'),
  PhotoPermissionError: class PhotoPermissionError extends Error {},
}));

jest.mock('@/lib/present-share', () => ({ presentShare: jest.fn(async () => {}) }));

const MICRODATA = `<html><body>
  <div itemscope itemtype="https://schema.org/Recipe">
    <h1 itemprop="name">Imported eggs</h1>
    <span itemprop="recipeIngredient">4 eggs</span>
    <span itemprop="recipeIngredient">1 tbsp butter</span>
    <span itemprop="recipeInstructions">Cook 4 minutes.</span>
  </div>
</body></html>`;

let view: { unmount: () => void } | undefined;

beforeEach(async () => {
  await require('@react-native-async-storage/async-storage').clear();
  jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => MICRODATA,
  } as Response);
});

afterEach(() => {
  view?.unmount();
  view = undefined;
  jest.restoreAllMocks();
});

function mount(url: string) {
  view?.unmount();
  view = renderRouter(routes(), { initialUrl: url });
  return view;
}

function routes() {
  return {
    _layout: require('@/app/_layout').default,
    '(tabs)/_layout': require('@/app/(tabs)/_layout').default,
    '(tabs)/index': require('@/app/(tabs)/index').default,
    '(tabs)/meal-plan': require('@/app/(tabs)/meal-plan').default,
    '(tabs)/shopping': require('@/app/(tabs)/shopping').default,
    add: require('@/app/add').default,
    import: require('@/app/import').default,
    'recipe/[id]/index': require('@/app/recipe/[id]/index').default,
    'recipe/[id]/edit': require('@/app/recipe/[id]/edit').default,
    settings: require('@/app/settings').default,
  };
}

describe('import screen (spec #1)', () => {
  it('Import link saves a pasted link straight away (no Save / Save-and-edit prompt)', async () => {
    mount('/import');
    fireEvent.changeText(await screen.findByTestId('import-url-input'), 'https://example.com/eggs');
    await act(async () => fireEvent.press(screen.getByTestId('import-url-button')));
    expect(await screen.findByTestId('recipe-detail')).toBeTruthy();
    expect(screen.queryByTestId('import-save')).toBeNull();
    expect(screen.queryByTestId('import-save-edit')).toBeNull();
    expect(screen.queryByText('Save and edit')).toBeNull();
    const saved = (await recipeStore.list()).find((r) => r.title === 'Imported eggs');
    expect(saved?.sourceUrl).toBe('https://example.com/eggs');
    expect(saved?.photoUri).toBeUndefined();
  });

  it('shows a download error and a page with no recipe', async () => {
    mount('/import');
    (globalThis.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    fireEvent.changeText(await screen.findByTestId('import-url-input'), 'https://example.com/down');
    await act(async () => fireEvent.press(screen.getByTestId('import-url-button')));
    expect(await screen.findByTestId('import-error-fetch_failed')).toBeTruthy();

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<html><p>No recipe here</p></html>',
    } as Response);
    fireEvent.changeText(screen.getByTestId('import-url-input'), 'https://example.com/empty');
    await act(async () => fireEvent.press(screen.getByTestId('import-url-button')));
    expect(await screen.findByTestId('import-error-no_recipe_found')).toBeTruthy();
  });

  it('rejects monk fruit and explains the allulose rule', async () => {
    mount('/import');
    fireEvent.changeText(
      await screen.findByTestId('import-text-input'),
      'Cookies\nIngredients:\n- 1 cup monk fruit sweetener\nSteps:\n1. Bake',
    );
    await act(async () => fireEvent.press(screen.getByTestId('import-text-button')));
    expect(await screen.findByTestId('import-error-forbidden_ingredient')).toHaveTextContent(/allulose/i);
    expect(await recipeStore.list()).toHaveLength(0);
  });

  it('pasted text still shows a draft before saving', async () => {
    mount('/import');
    fireEvent.changeText(
      await screen.findByTestId('import-text-input'),
      'Scrambled eggs\nIngredients:\n- 2 eggs\nSteps:\n1. Whisk\n2. Cook',
    );
    await act(async () => fireEvent.press(screen.getByTestId('import-text-button')));
    expect(await screen.findByTestId('import-draft')).toBeTruthy();
    expect(await recipeStore.list()).toHaveLength(0);
    await act(async () => fireEvent.press(screen.getByTestId('import-save')));
    expect(await screen.findByTestId('recipe-detail')).toBeTruthy();
    expect(await recipeStore.list()).toHaveLength(1);
  });

  it('opens an existing recipe when the link was already imported', async () => {
    mount('/import');
    fireEvent.changeText(await screen.findByTestId('import-url-input'), 'https://example.com/eggs');
    await act(async () => fireEvent.press(screen.getByTestId('import-url-button')));
    await screen.findByTestId('recipe-detail');

    mount('/import');
    fireEvent.changeText(await screen.findByTestId('import-url-input'), 'https://www.example.com/eggs/');
    await act(async () => fireEvent.press(screen.getByTestId('import-url-button')));
    expect(await screen.findByText('Already in your recipes')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('import-open-existing')));
    expect(await screen.findByTestId('recipe-detail')).toBeTruthy();
    expect(await recipeStore.list()).toHaveLength(1);
  });
});

describe('edit, notes, title, source link, photo, share', () => {
  it('edits title, notes, ingredients and step timers, and opens the source link', async () => {
    const recipe = createRecipe(
      {
        title: 'Old title',
        ingredients: [{ text: '2 eggs' }, { text: '1 tbsp butter' }],
        steps: [{ text: 'Cook.' }, { text: 'Serve.' }],
        tags: ['breakfast'],
        servings: 2,
        sourceUrl: 'https://example.com/eggs',
        notes: 'Original note',
      },
      new Date('2026-10-02T00:00:00Z'),
      'edit-me',
    );
    recipe.cooked = true;
    await recipeStore.save(recipe);

    mount('/recipe/edit-me');
    expect(await screen.findByTestId('recipe-notes')).toHaveTextContent('Original note');
    await act(async () => fireEvent.press(screen.getByTestId('source-link')));
    expect(require('react-native').Linking.openURL).toHaveBeenCalledWith('https://example.com/eggs');

    await act(async () => fireEvent.press(screen.getByTestId('edit-recipe-button')));
    expect(await screen.findByTestId('recipe-editor')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('edit-title'), 'Custom title');
    fireEvent.changeText(screen.getByTestId('edit-notes'), 'Whisk first.');
    fireEvent.changeText(screen.getByTestId('ingredient-sub-0'), 'allulose instead of sugar');
    await act(async () => fireEvent.press(screen.getByTestId('ingredient-down-0')));
    fireEvent.changeText(screen.getByTestId('step-minutes-0'), '12');
    await act(async () => fireEvent.press(screen.getByTestId('add-ingredient')));
    fireEvent.changeText(screen.getByTestId('ingredient-text-2'), '1 tsp salt');
    await act(async () => fireEvent.press(screen.getByTestId('take-photo-button')));
    await act(async () => fireEvent.press(screen.getByTestId('save-recipe-button')));

    await waitFor(async () => {
      const saved = await recipeStore.get('edit-me');
      expect(saved?.title).toBe('Custom title');
    });
    const saved = await recipeStore.get('edit-me');
    expect(saved?.notes).toBe('Whisk first.');
    expect(saved?.ingredients.map((i) => i.text)).toEqual(['1 tbsp butter', '2 eggs', '1 tsp salt']);
    expect(saved?.ingredients[1].substitutionNote).toBe('allulose instead of sugar');
    expect(saved?.steps[0].durationSeconds).toBe(12 * 60);
    expect(saved?.photoUri).toBe('file:///docs/recipe-photos/picked.jpg');
    expect(saved?.cooked).toBe(true);
    expect(saved?.sourceUrl).toBe('https://example.com/eggs');
    expect(saved?.tags).toEqual(['breakfast']);
  });

  it('shares any combination through the share sheet', async () => {
    const { presentShare } = require('@/lib/present-share') as { presentShare: jest.Mock };
    presentShare.mockClear();
    const recipe = createRecipe({
      title: 'Share me',
      ingredients: [{ text: '2 eggs' }],
      steps: [{ text: 'Scramble.' }],
      tags: [],
      servings: 1,
      sourceUrl: 'https://example.com/share',
      photoUri: 'file:///docs/recipe-photos/share.jpg',
    });
    await recipeStore.save(recipe);
    mount(`/recipe/${recipe.id}`);
    fireEvent.press(await screen.findByTestId('share-recipe-button'));
    expect(await screen.findByTestId('share-panel')).toBeTruthy();
    fireEvent.press(screen.getByTestId('share-toggle-photo'));
    fireEvent.press(screen.getByTestId('share-toggle-link'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('share-confirm'));
    });
    expect(presentShare).toHaveBeenCalledTimes(1);
    const request = presentShare.mock.calls[0][0];
    expect(request.message).toContain('Share me');
    expect(request.message).toContain('https://example.com/share');
    expect(request.fileUri).toBe('file:///docs/recipe-photos/share.jpg');
  });
});
