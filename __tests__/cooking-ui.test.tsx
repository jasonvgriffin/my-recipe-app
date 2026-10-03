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

describe('recipe units and scaling (spec #16)', () => {
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
