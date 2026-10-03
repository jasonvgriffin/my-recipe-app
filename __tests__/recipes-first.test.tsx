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
  '(tabs)/more': require('@/app/(tabs)/more').default,
  '(tabs)/add-menu': require('@/app/(tabs)/add-menu').default,
  'pantry/scan': require('@/app/pantry/scan').default,
  'shopping/scan': require('@/app/shopping/scan').default,
  recipes: require('@/app/recipes').default,
  'pantry-match': require('@/app/pantry-match').default,
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

// Requiring every screen transforms most of the app. On a cold CI cache that alone can exceed Jest's 5 s
// per-test timeout, so load the screens once up front (with their own timeout) instead of inside the first test.
beforeAll(() => {
  routes();
}, 60_000);

beforeEach(async () => {
  await require('@react-native-async-storage/async-storage').clear();
});

describe('recipes-first', () => {
  it('opens to Recipes with no onboarding / sign-in', async () => {
    renderRouter(routes(), { initialUrl: '/' });
    expect(await screen.findByTestId('add-recipe-button')).toBeTruthy();
    expect(screen).toHavePathname('/');
    expect(screen.queryByText(/sign in/i)).toBeNull();
    // v1.0.1: five clear buttons and no sample recipes.
    for (const id of ['home-search', 'home-existing', 'home-share', 'add-recipe-button', 'home-pantry-match'])
      expect(screen.getByTestId(id)).toBeTruthy();
    // v1.0.2: titles only, no gray subtitle under the buttons.
    expect(screen.queryByText('Browse, filter and open your recipes')).toBeNull();
    expect(screen.queryByText('Type one in or import from a link')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('home-existing')));
    expect(await screen.findByText(/No recipes yet/)).toBeTruthy();
  });

  it('pantry match explains gently when the pantry is hidden', async () => {
    await settingsStore.update({ features: { mealPlan: false, shopping: false, pantry: false } });
    renderRouter(routes(), { initialUrl: '/' });
    await act(async () => fireEvent.press(await screen.findByTestId('home-pantry-match')));
    expect(await screen.findByTestId('pantry-match-off')).toBeTruthy();
    expect(screen.queryByText(/buy|upgrade|subscribe/i)).toBeNull();
  });

  it('full recipe workflow with all optional features hidden', async () => {
    await settingsStore.update({ features: { mealPlan: false, shopping: false, pantry: false } });
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('add-recipe-button');
    await waitFor(() => expect(screen.queryByText('Meal Plan')).toBeNull());
    expect(screen.queryByText('Shopping')).toBeNull();
    expect(screen.queryByText('Pantry')).toBeNull();
    // v1.0.2: the + button and More stay; the + menu only offers recipe actions.
    await act(async () => fireEvent.press(screen.getByTestId('tab-add-button')));
    expect(screen.getByTestId('add-menu-add-recipe')).toBeTruthy();
    for (const id of ['add-shopping', 'add-pantry', 'plan-meal', 'what-can-i-make'])
      expect(screen.queryByTestId(`add-menu-${id}`)).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('add-menu-backdrop')));
    await waitFor(() => expect(screen.queryByTestId('add-menu-sheet')).toBeNull());

    // Add a recipe
    await act(async () => fireEvent.press(screen.getByTestId('add-recipe-button')));
    await screen.findByText('Save recipe');
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Cauliflower Mac & Cheese'), 'Zucchini Lasagna');
    fireEvent.changeText(screen.getByPlaceholderText(/1 head cauliflower/), '2 zucchini\n1 cup ricotta');
    fireEvent.changeText(screen.getByPlaceholderText(/Preheat oven/), 'Layer\nBake 30 minutes');
    await act(async () => fireEvent.press(screen.getByText('Save recipe')));

    // Back on the Recipes tab → Existing Recipes → open it → detail has recipe actions but no meal-plan cross-link
    await act(async () => fireEvent.press(await screen.findByTestId('home-existing')));
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
    expect(await screen.findByText('Meal Plan')).toBeTruthy();
    expect(screen.getByText('Shopping')).toBeTruthy();
    // v1.0.2: Pantry lives under More.
    await act(async () => fireEvent.press(screen.getByText('More')));
    expect(await screen.findByTestId('more-pantry')).toBeTruthy();
  });
});
