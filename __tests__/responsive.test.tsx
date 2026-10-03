/**
 * Spec #23 acceptance: every screen is verified at compact AND expanded widths.
 * Add a case here for each new screen (render at COMPACT and EXPANDED, assert the right panes).
 */
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { TwoPaneLayout } from '@/components/layout';
import { addSampleRecipes, SAMPLE_RECIPES } from '../test-helpers/sample-recipes';
import { getWindowSizeClass } from '@/hooks/use-window-size-class';

const COMPACT = 411; // folded / phone
const MEDIUM = 673; // unfolded book foldable, portrait
const EXPANDED = 900; // unfolded landscape / tablet

let mockWidth = COMPACT;
jest.mock('@/hooks/use-window-size-class', () => {
  const actual = jest.requireActual('@/hooks/use-window-size-class');
  return { ...actual, useWindowSizeClass: () => actual.getWindowLayout(mockWidth, 800) };
});

beforeEach(async () => {
  mockWidth = COMPACT;
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  await AsyncStorage.clear();
});

describe('window size classes', () => {
  it.each([
    [0, 'compact'],
    [599, 'compact'],
    [600, 'medium'],
    [839, 'medium'],
    [840, 'expanded'],
    [1280, 'expanded'],
  ])('%sdp → %s', (w, cls) => expect(getWindowSizeClass(w)).toBe(cls));
});

describe('TwoPaneLayout', () => {
  it('is single-pane at compact and side-by-side at medium/expanded, without remounting the primary pane', async () => {
    let mounts = 0;
    function Primary() {
      useEffect(() => {
        mounts++;
      }, []);
      return <Text>LIST</Text>;
    }
    const ui = () => <TwoPaneLayout primary={<Primary />} secondary={null} placeholder={<Text>PICK ONE</Text>} />;

    await render(ui());
    expect(screen.getByTestId('two-pane-layout-single')).toBeTruthy();
    expect(screen.queryByText('PICK ONE')).toBeNull();

    // Unfold: same tree, now two panes.
    mockWidth = EXPANDED;
    await screen.rerender(ui());
    expect(screen.getByTestId('two-pane-layout-dual')).toBeTruthy();
    expect(screen.getByText('PICK ONE')).toBeTruthy();

    mockWidth = MEDIUM;
    await screen.rerender(ui());
    expect(screen.getByTestId('two-pane-layout-dual')).toBeTruthy();

    mockWidth = COMPACT;
    await screen.rerender(ui());
    expect(mounts).toBe(1); // state survives fold/unfold
  });
});

describe.each([
  ['compact', COMPACT],
  ['expanded', EXPANDED],
])('screens at %s width', (_label, width) => {
  beforeEach(() => {
    mockWidth = width;
  });

  it('RecipeDetail renders a recipe', async () => {
    const { recipeStore } = require('@/storage/recipes');
    await addSampleRecipes(recipeStore);
    const [first] = await recipeStore.list();
    const RecipeRoute = require('@/app/recipe/[id]/index').default;
    renderRouter({ 'recipe/[id]': RecipeRoute }, { initialUrl: `/recipe/${first.id}` });
    expect(await screen.findByTestId('recipe-detail')).toBeTruthy();
    expect(screen.getByText('Ingredients')).toBeTruthy();
    expect(screen.getByTestId('servings-units')).toBeTruthy();
    expect(screen.getByTestId('detail-rating')).toBeTruthy();
    expect(screen.getByTestId('cooked-toggle')).toBeTruthy();
    expect(screen.getByTestId('add-tag-input')).toBeTruthy();
    expect(screen.getByTestId('edit-recipe-button')).toBeTruthy();
  });

  it('edit screen shows the full editor', async () => {
    const { recipeStore } = require('@/storage/recipes');
    await addSampleRecipes(recipeStore);
    const [first] = await recipeStore.list();
    const EditRoute = require('@/app/recipe/[id]/edit').default;
    renderRouter({ 'recipe/[id]/edit': EditRoute }, { initialUrl: `/recipe/${first.id}/edit` });
    expect(await screen.findByTestId('recipe-editor')).toBeTruthy();
    expect(screen.getByTestId('edit-title').props.value).toBe(first.title);
    expect(screen.getByText('Save changes')).toBeTruthy();
  });

  it('import screen shows link and text fields', async () => {
    const ImportRoute = require('@/app/import').default;
    renderRouter({ import: ImportRoute }, { initialUrl: '/import' });
    expect(await screen.findByTestId('import-screen')).toBeTruthy();
    expect(screen.getByTestId('import-url-input')).toBeTruthy();
    expect(screen.getByTestId('import-text-input')).toBeTruthy();
  });

  it('Recipes tab: the recipe list with the search bar (v1.0.4, no five-link home)', async () => {
    const RecipesTab = require('@/app/(tabs)/index').default;
    renderRouter({ index: RecipesTab }, { initialUrl: '/' });
    expect(await screen.findByTestId('search-input')).toBeTruthy();
    expect(screen.getByTestId('recipes-layout-primary')).toBeTruthy();
    expect(screen.queryByTestId('recipes-home')).toBeNull();
  });

  it('Existing Recipes: list-detail in expanded, navigation in compact', async () => {
    const { recipeStore } = require('@/storage/recipes');
    await addSampleRecipes(recipeStore);
    const RecipesTab = require('@/app/recipes').default;
    const RecipeRoute = require('@/app/recipe/[id]/index').default;
    renderRouter({ index: RecipesTab, 'recipe/[id]': RecipeRoute }, { initialUrl: '/' });
    await screen.findByText(SAMPLE_RECIPES[1].title);
    expect(screen.getByTestId('search-input')).toBeTruthy();
    expect(screen.getByTestId('recipe-filters')).toBeTruthy();
    expect(screen.getByTestId('filter-cooked')).toBeTruthy();
    expect(screen.getByTestId('filter-recent')).toBeTruthy();
    const target = (await recipeStore.list()).find((r: { title: string }) => r.title === SAMPLE_RECIPES[1].title);
    const item = screen.getByTestId(`recipe-item-${target.id}`);
    if (width >= 600) {
      expect(screen.getByTestId('recipes-layout-dual')).toBeTruthy();
      expect(screen.getByText('Select a recipe to see it here.')).toBeTruthy();
      await act(async () => fireEvent.press(item));
      expect(await screen.findByTestId('recipe-detail')).toBeTruthy();
      expect(screen).toHavePathname('/');
    } else {
      expect(screen.getByTestId('recipes-layout-single')).toBeTruthy();
      await act(async () => fireEvent.press(item));
      expect(screen).toHavePathname(`/recipe/${target.id}`);
    }
  });

  it.each([
    ['(tabs)/meal-plan', 'Today'],
    ['(tabs)/shopping', 'No list yet for this week.'],
    ['add', 'Save recipe'],
    ['settings', 'Optional features'],
    ['organize', 'Categories'],
  ])('%s renders (width-capped)', async (route, text) => {
    const Screen = require(`@/app/${route}`).default;
    renderRouter({ index: Screen }, { initialUrl: '/' });
    expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
  });

  it('Household settings screen shows account and members panes', async () => {
    const Household = require('@/app/household').default;
    renderRouter({ index: Household }, { initialUrl: '/' });
    expect(await screen.findByTestId(width >= 600 ? 'household-layout-dual' : 'household-layout-single')).toBeTruthy();
    expect(screen.getByTestId('household-screen')).toBeTruthy();
    expect(screen.getByText(/Invite code and members/)).toBeTruthy();
    expect(screen.queryByText(/buy|upgrade|subscribe|purchase/i)).toBeNull();
  });

  it('Pantry tab: one width-capped list (suggestions moved to the Recipes tab)', async () => {
    const Pantry = require('@/app/(tabs)/pantry').default;
    renderRouter({ index: Pantry }, { initialUrl: '/' });
    expect(await screen.findByText('Nothing in the pantry yet.')).toBeTruthy();
    expect(screen.getByTestId('pantry-layout')).toBeTruthy();
    expect(screen.queryByTestId('pantry-suggestions')).toBeNull();
  });

  it('pantry match renders (width-capped)', async () => {
    const Match = require('@/app/pantry-match').default;
    renderRouter({ index: Match }, { initialUrl: '/' });
    expect(await screen.findByTestId('pantry-match-empty')).toBeTruthy();
  });

  it('barcode scanner shows the camera and the result pane', async () => {
    const Scan = require('@/app/pantry/scan').default;
    renderRouter({ index: Scan }, { initialUrl: '/' });
    expect(await screen.findByTestId('barcode-camera')).toBeTruthy();
    expect(screen.getByText('Point the camera at a barcode.')).toBeTruthy();
    expect(screen.getByTestId(width >= 600 ? 'barcode-layout-dual' : 'barcode-layout-single')).toBeTruthy();
  });

  it('shopping-list barcode scanner shows the camera and the result pane', async () => {
    const Scan = require('@/app/shopping/scan').default;
    renderRouter({ index: Scan }, { initialUrl: '/' });
    expect(await screen.findByTestId('barcode-camera')).toBeTruthy();
    expect(screen.getByTestId(width >= 600 ? 'barcode-layout-dual' : 'barcode-layout-single')).toBeTruthy();
  });

  it('meal plan is a calendar, with the selected day beside it when expanded', async () => {
    const Screen = require('@/app/(tabs)/meal-plan').default;
    renderRouter({ index: Screen }, { initialUrl: '/' });
    expect(await screen.findByTestId('meal-calendar')).toBeTruthy();
    expect(screen.getByTestId(width >= 600 ? 'meal-plan-layout-dual' : 'meal-plan-layout-single')).toBeTruthy();
    if (width >= 600) expect(screen.getByTestId('day-plan')).toBeTruthy();
    else expect(screen.queryByTestId('day-plan')).toBeNull();
  });

  it('shopping list shows the pantry pane only when expanded', async () => {
    const Screen = require('@/app/(tabs)/shopping').default;
    renderRouter({ index: Screen }, { initialUrl: '/' });
    expect(await screen.findByText('No list yet for this week.')).toBeTruthy();
    expect(screen.getByTestId(width >= 600 ? 'shopping-layout-dual' : 'shopping-layout-single')).toBeTruthy();
    if (width >= 600) expect(screen.getByTestId('pantry-on-hand')).toBeTruthy();
    else expect(screen.queryByTestId('pantry-on-hand')).toBeNull();
  });

  it('cook screen (deep link myrecipeapp://cook/{id}) shows the current step', async () => {
    const { recipeStore } = require('@/storage/recipes');
    await addSampleRecipes(recipeStore);
    const r = (await recipeStore.list()).find((x: { title: string }) => x.title === SAMPLE_RECIPES[0].title);
    const CookScreen = require('@/app/cook/[action]').default;
    renderRouter({ 'cook/[action]': CookScreen }, { initialUrl: `/cook/${r.id}` });
    expect(await screen.findByText(r.steps[0].text)).toBeTruthy();
    expect(screen.getByTestId(width >= 600 ? 'cook-layout-dual' : 'cook-layout-single')).toBeTruthy();
    expect(screen.getByTestId('cook-ingredients')).toBeTruthy();
    if (width >= 600) {
      expect(screen.getByTestId('cook-layout-secondary')).toBeTruthy();
    } else {
      expect(screen.queryByTestId('cook-layout-secondary')).toBeNull();
    }
    await act(async () => fireEvent.press(screen.getByText('Next ›')));
    expect(await screen.findByText(r.steps[1].text)).toBeTruthy();
  });

  it('settings shows the unit default and keep-awake toggle', async () => {
    const Screen = require('@/app/settings').default;
    renderRouter({ index: Screen }, { initialUrl: '/' });
    expect(await screen.findByTestId('settings-unit-metric')).toBeTruthy();
    expect(screen.getByTestId('keep-awake-toggle')).toBeTruthy();
  });
});
