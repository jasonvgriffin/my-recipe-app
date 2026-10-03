/**
 * RECIPES ARE THE CORE (docs/SPEC.md). Acceptance: the full recipe workflow works with ALL optional
 * features hidden — no optional tabs, no cross-links, no prompts. Keep this test green in every PR.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { settingsStore } from '@/storage/settings';

const routes = () => ({
  _layout: require('@/app/_layout').default,
  '(tabs)/_layout': require('@/app/(tabs)/_layout').default,
  '(tabs)/index': require('@/app/(tabs)/index').default,
  '(tabs)/meal-plan': require('@/app/(tabs)/meal-plan').default,
  '(tabs)/shopping': require('@/app/(tabs)/shopping').default,
  '(tabs)/pantry': require('@/app/(tabs)/pantry').default,
  'pantry/scan': require('@/app/pantry/scan').default,
  'pantry/receipt': require('@/app/pantry/receipt').default,
  add: require('@/app/add').default,
  'recipe/[id]': require('@/app/recipe/[id]/index').default,
  'recipe/[id]/edit': require('@/app/recipe/[id]/edit').default,
  'cook/[action]': require('@/app/cook/[action]').default,
  import: require('@/app/import').default,
  'meal-plan/[date]': require('@/app/meal-plan/[date]').default,
  'grocery-run': require('@/app/grocery-run').default,
  settings: require('@/app/settings').default,
  household: require('@/app/household').default,
});

beforeEach(async () => {
  await require('@react-native-async-storage/async-storage').clear();
});

describe('recipes-first', () => {
  it('opens to Recipes with no onboarding / sign-in', async () => {
    renderRouter(routes(), { initialUrl: '/' });
    expect(await screen.findByTestId('add-recipe-button')).toBeTruthy();
    expect(screen).toHavePathname('/');
    expect(screen.queryByText(/sign in/i)).toBeNull();
  });

  it('full recipe workflow with all optional features hidden', async () => {
    await settingsStore.update({ features: { mealPlan: false, shopping: false, pantry: false } });
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('add-recipe-button');
    await waitFor(() => expect(screen.queryByText('Meal plan')).toBeNull());
    expect(screen.queryByText('Shopping list')).toBeNull();
    expect(screen.queryByText('Pantry')).toBeNull();

    // Add a recipe
    await act(async () => fireEvent.press(screen.getByTestId('add-recipe-button')));
    await screen.findByText('Save recipe');
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Cauliflower Mac & Cheese'), 'Zucchini Lasagna');
    fireEvent.changeText(screen.getByPlaceholderText(/1 head cauliflower/), '2 zucchini\n1 cup ricotta');
    fireEvent.changeText(screen.getByPlaceholderText(/Preheat oven/), 'Layer\nBake 30 minutes');
    fireEvent.changeText(screen.getByTestId('carbs-input'), '7');
    await act(async () => fireEvent.press(screen.getByText('Save recipe')));

    // Back on the list → open it → detail has recipe actions but no meal-plan cross-link
    const item = await screen.findByText('Zucchini Lasagna');
    await act(async () => fireEvent.press(item));
    expect(await screen.findByTestId('recipe-detail')).toBeTruthy();
    expect(screen.getByText('Mark cooked')).toBeTruthy();
    expect(screen.queryByTestId('plan-today-button')).toBeNull();
    expect(screen.getByText(/30:00|0:30:00/)).toBeTruthy(); // step timer detected
  });

  it('optional tabs come back when enabled in Settings', async () => {
    await settingsStore.update({ features: { mealPlan: true, shopping: true, pantry: true } });
    renderRouter(routes(), { initialUrl: '/' });
    expect(await screen.findByText('Meal plan')).toBeTruthy();
    expect(screen.getByText('Shopping list')).toBeTruthy();
    expect(screen.getByText('Pantry')).toBeTruthy();
  });
});
