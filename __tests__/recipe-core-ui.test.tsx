import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert } from 'react-native';

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
  async function openImport() {
    mount('/');
    const { router } = require('expo-router');
    await act(async () => router.push('/import'));
    await screen.findByTestId('import-url-input');
    return router as { back: () => void; push: (href: string) => void };
  }

  async function previewLink(url = 'https://example.com/eggs') {
    fireEvent.changeText(await screen.findByTestId('import-url-input'), url);
    await act(async () => fireEvent.press(screen.getByTestId('import-url-button')));
    expect(await screen.findByTestId('import-draft')).toBeTruthy();
  }

  it('shows a draft for a parsed link and saves only when Save is tapped', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    await openImport();
    await previewLink();
    expect(screen.getByText('Draft')).toBeTruthy();
    expect(screen.getByTestId('import-save')).toBeEnabled();
    expect(screen.getByText('Save and edit')).toBeTruthy();
    expect(within(screen.getByTestId('import-screen')).queryByTestId('import-save')).toBeNull();
    expect(await recipeStore.list()).toHaveLength(0);
    await act(async () => fireEvent.press(screen.getByTestId('import-save')));
    expect(await screen.findByTestId('recipe-detail')).toBeTruthy();
    expect(alert).not.toHaveBeenCalled();
    const saved = (await recipeStore.list()).find((r) => r.title === 'Imported eggs');
    expect(saved?.sourceUrl).toBe('https://example.com/eggs');
    expect(saved?.photoUri).toBeUndefined();
  });

  it('Save and edit opens the editor after the write', async () => {
    mount('/import');
    await previewLink();
    await act(async () => fireEvent.press(screen.getByTestId('import-save-edit')));
    expect(await screen.findByTestId('recipe-editor')).toBeTruthy();
    const saved = (await recipeStore.list()).find((r) => r.title === 'Imported eggs');
    expect(saved?.sourceUrl).toBe('https://example.com/eggs');
  });

  it('shows a download error and a page with no recipe', async () => {
    mount('/import');
    (globalThis.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    fireEvent.changeText(await screen.findByTestId('import-url-input'), 'https://example.com/down');
    await act(async () => fireEvent.press(screen.getByTestId('import-url-button')));
    expect(await screen.findByTestId('import-error-fetch_failed')).toBeTruthy();
    expect(screen.queryByTestId('import-draft')).toBeNull();
    expect(screen.queryByTestId('recipe-detail')).toBeNull();

    (globalThis.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<html><p>No recipe here</p></html>',
    } as Response);
    fireEvent.changeText(screen.getByTestId('import-url-input'), 'https://example.com/empty');
    await act(async () => fireEvent.press(screen.getByTestId('import-url-button')));
    expect(await screen.findByTestId('import-error-no_recipe_found')).toBeTruthy();
    expect(screen.queryByTestId('recipe-detail')).toBeNull();
    expect(await recipeStore.list()).toHaveLength(0);
  });

  it('shows an error for an empty link and no draft', async () => {
    mount('/import');
    await act(async () => fireEvent.press(await screen.findByTestId('import-url-button')));
    expect(await screen.findByTestId('import-error-invalid_input')).toBeTruthy();
    expect(screen.queryByTestId('import-draft')).toBeNull();
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

  it('editing the link or the pasted text after a preview clears the draft and does not save it', async () => {
    mount('/import');
    await previewLink();
    fireEvent.changeText(screen.getByTestId('import-url-input'), 'https://example.com/other');
    expect(screen.queryByTestId('import-draft')).toBeNull();
    expect(screen.getByTestId('import-save')).toBeDisabled();
    await act(async () => fireEvent.press(screen.getByTestId('import-save')));
    expect(await recipeStore.list()).toHaveLength(0);
    expect(screen.queryByTestId('recipe-detail')).toBeNull();

    fireEvent.changeText(
      screen.getByTestId('import-text-input'),
      'Scrambled eggs\nIngredients:\n- 2 eggs\nSteps:\n1. Whisk',
    );
    await act(async () => fireEvent.press(screen.getByTestId('import-text-button')));
    expect(await screen.findByTestId('import-draft')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('import-text-input'), 'Changed title\nIngredients:\n- 2 eggs\nSteps:\n1. Whisk');
    expect(screen.queryByTestId('import-draft')).toBeNull();
    expect(screen.getByTestId('import-save')).toBeDisabled();
    await act(async () => fireEvent.press(screen.getByTestId('import-save')));
    expect(await recipeStore.list()).toHaveLength(0);
  });

  it('keeps the draft on screen when the write fails', async () => {
    mount('/import');
    await previewLink();
    jest.spyOn(recipeStore, 'save').mockRejectedValueOnce(new Error('disk full'));
    await act(async () => fireEvent.press(screen.getByTestId('import-save')));
    expect(await screen.findByTestId('import-error-save_failed')).toBeTruthy();
    expect(screen.getByTestId('import-draft')).toBeTruthy();
    expect(screen.queryByTestId('recipe-detail')).toBeNull();
    expect(await recipeStore.list()).toHaveLength(0);
  });

  it('opens an existing recipe when the link was already imported, and leaving does not warn', async () => {
    const existing = createRecipe({
      title: 'Imported eggs',
      ingredients: [{ text: '4 eggs' }],
      steps: [{ text: 'Cook 4 minutes.' }],
      tags: [],
      servings: 1,
      sourceUrl: 'https://example.com/eggs',
    });
    await recipeStore.save(existing);
    const alert = jest.spyOn(Alert, 'alert');
    const router = await openImport();
    fireEvent.changeText(screen.getByTestId('import-url-input'), 'https://www.example.com/eggs/');
    await act(async () => fireEvent.press(screen.getByTestId('import-url-button')));
    expect(await screen.findByText('Already in your recipes')).toBeTruthy();
    expect(screen.queryByTestId('import-save')).toBeNull();
    await act(async () => router.back());
    expect(alert).not.toHaveBeenCalled();
    expect(await recipeStore.list()).toHaveLength(1);

    mount('/import');
    fireEvent.changeText(await screen.findByTestId('import-url-input'), 'https://www.example.com/eggs/');
    await act(async () => fireEvent.press(screen.getByTestId('import-url-button')));
    expect(await screen.findByText('Already in your recipes')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('import-open-existing')));
    expect(await screen.findByTestId('recipe-detail')).toBeTruthy();
    expect(await recipeStore.list()).toHaveLength(1);
  });

  it('asks before leaving a draft; Save stores it and Discard drops it', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const router = await openImport();
    await previewLink();
    expect(await recipeStore.list()).toHaveLength(0);
    await act(async () => router.back());
    expect(alert).toHaveBeenCalledWith('Save changes?', expect.any(String), expect.any(Array));
    expect(screen.getByTestId('import-draft')).toBeTruthy();
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(buttons.map((b) => b.text)).toEqual(['Keep editing', 'Discard', 'Save']);

    alert.mockClear();
    await act(async () => buttons.find((b) => b.text === 'Discard')!.onPress!());
    expect(await screen.findByTestId('search-input')).toBeTruthy();
    expect(await recipeStore.list()).toHaveLength(0);
    expect(alert).not.toHaveBeenCalled();

    await act(async () => router.push('/import'));
    await previewLink();
    await act(async () => router.back());
    const saveButtons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    alert.mockClear();
    await act(async () => saveButtons.find((b) => b.text === 'Save')!.onPress!());
    await waitFor(async () => {
      expect((await recipeStore.list()).some((r) => r.title === 'Imported eggs')).toBe(true);
    });
    expect(alert).not.toHaveBeenCalled();
    expect(await screen.findByTestId('search-input')).toBeTruthy();
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
    fireEvent.changeText(screen.getByTestId('ingredient-sub-0'), 'honey instead of sugar');
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
    expect(saved?.ingredients[1].substitutionNote).toBe('honey instead of sugar');
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
