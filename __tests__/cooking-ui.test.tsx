import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Notifications from 'expo-notifications';
import { renderRouter } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { RecipeDetail } from '@/components/recipe-detail';
import { SEED_RECIPES } from '@/data/seed';
import { createRecipe } from '@/lib/recipe-utils';
import { barcodeItems } from '@/pantry';
import { recipeStore } from '@/storage/recipes';
import { settingsStore } from '@/storage/settings';

beforeEach(async () => {
  jest.clearAllMocks();
  await require('@react-native-async-storage/async-storage').clear();
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true, canAskAgain: true });
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true, canAskAgain: true });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('cooking mode UI (spec #19, #15, #24)', () => {
  it('keeps the screen awake, then releases the lock when the setting is off', async () => {
    await recipeStore.seedIfNeeded();
    const r = (await recipeStore.list()).find((x) => x.title === SEED_RECIPES[0].title)!;
    const Cook = require('@/app/cook/[action]').default;
    const ui = renderRouter({ 'cook/[action]': Cook }, { initialUrl: `/cook/${r.id}` });
    expect(await screen.findByText(r.steps[0].text)).toBeTruthy();
    expect(activateKeepAwakeAsync).toHaveBeenCalledWith('cooking-mode');

    await act(async () => {
      await settingsStore.update({ cookingModeKeepAwake: false });
    });
    await waitFor(() => expect(deactivateKeepAwake).toHaveBeenCalledWith('cooking-mode'));
    ui.unmount();
  });

  it('starts concurrent step timers with notifications and stays in sync with deep links', async () => {
    const recipe = createRecipe({
      title: 'Timer chicken',
      servings: 2,
      tags: [],
      nutrition: { netCarbsG: 1, source: 'manual' },
      ingredients: [{ text: '200 g chicken thighs' }, { text: '1 tbsp olive oil' }],
      steps: [{ text: 'Sear 2 minutes per side.' }, { text: 'Rest 5 minutes.' }],
    });
    await recipeStore.save(recipe);
    const Cook = require('@/app/cook/[action]').default;
    renderRouter({ 'cook/[action]': Cook }, { initialUrl: `/cook/${recipe.id}?step=1` });
    expect(await screen.findByText(recipe.steps[0].text)).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByTestId('cook-timer')));
    await act(async () => fireEvent.press(screen.getByTestId('cook-next')));
    expect(await screen.findByText(recipe.steps[1].text)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('cook-timer')));
    await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2));
    const ids = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.map((c) => c[0].identifier);
    expect(ids).toEqual([`step-timer:${recipe.id}:0`, `step-timer:${recipe.id}:1`]);
    expect(screen.getByTestId('cook-other-timers')).toBeTruthy();

    const { router } = require('expo-router');
    await act(async () => {
      router.push(`/cook/current`);
    });
    expect(await screen.findByText(recipe.steps[1].text)).toBeTruthy();
    await act(async () => {
      router.push(`/cook/previous`);
    });
    expect(await screen.findByText(recipe.steps[0].text)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('cook-repeat')));
    expect(screen.getByTestId('cook-step-text')).toHaveTextContent(recipe.steps[0].text);
  });

  it('tells the cook when notifications are denied and still shows the countdown', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: true });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: false });
    const recipe = createRecipe({
      title: 'Quiet timer',
      servings: 1,
      tags: [],
      nutrition: { netCarbsG: 1 },
      ingredients: [{ text: '1 egg' }],
      steps: [{ text: 'Boil 3 minutes.' }],
    });
    await recipeStore.save(recipe);
    const Cook = require('@/app/cook/[action]').default;
    renderRouter({ 'cook/[action]': Cook }, { initialUrl: `/cook/${recipe.id}` });
    await screen.findByText(recipe.steps[0].text);
    await act(async () => fireEvent.press(screen.getByTestId('cook-timer')));
    expect(await screen.findByTestId('cook-notifications-off')).toBeTruthy();
    expect(screen.getByTestId('cook-timer-remaining')).toBeTruthy();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('recipe units, scaling, and nutrition (spec #16, #17)', () => {
  it('converts from the settings default, overrides per recipe, and scales servings', async () => {
    await settingsStore.update({ unitSystem: 'metric' });
    await recipeStore.seedIfNeeded();
    const r = (await recipeStore.list()).find((x) => x.title === SEED_RECIPES[0].title)!;
    renderRouter({ index: () => <RecipeDetail id={r.id} /> }, { initialUrl: '/' });
    expect(await screen.findByText(/454 g green beans/)).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByTestId('unit-system-original')));
    expect(await screen.findByText(/1 lb green beans/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('servings-minus'));
      fireEvent.press(screen.getByTestId('servings-minus'));
      fireEvent.press(screen.getByTestId('servings-minus'));
    });
    expect(screen.getByTestId('servings-value')).toHaveTextContent('3');
    expect(screen.getByText(/1 tbsp olive oil/)).toBeTruthy();
  });

  it('edits nutrition by hand and can apply a complete barcode computation', async () => {
    await recipeStore.seedIfNeeded();
    const base = (await recipeStore.list()).find((x) => x.title === SEED_RECIPES[0].title)!;
    const recipe = await recipeStore.save({
      ...base,
      id: 'weighed-chicken',
      servings: 2,
      ingredients: [{ text: '200 g chicken thighs', quantity: 200, unit: 'g', name: 'chicken thighs' }],
      nutrition: { source: 'manual' },
    });
    await barcodeItems.save({
      id: 'off-chicken',
      barcode: '00012345678905',
      name: 'chicken thighs',
      source: 'openfoodfacts',
      nutritionPer100g: { calories: 200, carbsG: 0, fiberG: 0, proteinG: 25, fatG: 12 },
      createdAt: '2026-10-03T00:00:00.000Z',
      updatedAt: '2026-10-03T00:00:00.000Z',
    });
    renderRouter({ index: () => <RecipeDetail id={recipe.id} /> }, { initialUrl: '/' });
    expect(await screen.findByTestId('nutrition-netCarbsG')).toHaveTextContent(/unknown/);

    await act(async () => fireEvent.press(screen.getByTestId('nutrition-edit')));
    fireEvent.changeText(screen.getByTestId('nutrition-input-calories'), '390');
    fireEvent.changeText(screen.getByTestId('nutrition-input-netCarbsG'), '5');
    fireEvent.changeText(screen.getByTestId('nutrition-input-carbsG'), '');
    await act(async () => fireEvent.press(screen.getByTestId('nutrition-save')));
    expect(await screen.findByTestId('nutrition-calories')).toHaveTextContent(/390 kcal/);
    expect(screen.getByTestId('nutrition-carbsG')).toHaveTextContent(/unknown/);
    expect(screen.getByTestId('nutrition-netCarbsG')).toHaveTextContent(/5 g/);

    await act(async () => fireEvent.press(await screen.findByTestId('nutrition-use-computed')));
    expect(await screen.findByTestId('nutrition-calories')).toHaveTextContent(/200 kcal/);
    expect(screen.getByTestId('nutrition-netCarbsG')).toHaveTextContent(/0 g/);
    expect(screen.getByText('Computed from ingredient nutrition')).toBeTruthy();
  });

  it('starts a step timer from the recipe with a notification', async () => {
    await recipeStore.seedIfNeeded();
    const r = (await recipeStore.list()).find((x) => x.title === SEED_RECIPES[0].title)!;
    renderRouter({ index: () => <RecipeDetail id={r.id} /> }, { initialUrl: '/' });
    await screen.findByTestId('step-timer-3');
    await act(async () => fireEvent.press(screen.getByTestId('step-timer-3')));
    await waitFor(() =>
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          identifier: `step-timer:${r.id}:3`,
          content: expect.objectContaining({ sound: true }),
        }),
      ),
    );
    expect(Alert.alert).toHaveBeenCalledWith('Timer started', expect.stringContaining('notification'));
  });
});
