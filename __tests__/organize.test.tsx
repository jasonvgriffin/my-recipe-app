/**
 * Spec #3 categories, #20 tags, #8 search, #9 filters, #10 cooked history, #22 ratings.
 * Optional-tab show/hide toggles live in Settings and are covered here too.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { addSampleRecipes, SAMPLE_RECIPES } from '../test-helpers/sample-recipes';
import { LocalFreeEntitlements, NoEntitlements, featureGate, type FeatureId } from '@/entitlements';
import { setCooked, setRating } from '@/lib/recipe-utils';
import { recipeStore } from '@/storage/recipes';
import { settingsStore } from '@/storage/settings';
import type { Recipe } from '@/types/recipe';

let mockWidth = 411;
jest.mock('@/hooks/use-window-size-class', () => {
  const actual = jest.requireActual('@/hooks/use-window-size-class');
  return { ...actual, useWindowSizeClass: () => actual.getWindowLayout(mockWidth, 800) };
});

const routes = () => ({
  _layout: require('@/app/_layout').default,
  '(tabs)/_layout': require('@/app/(tabs)/_layout').default,
  '(tabs)/index': require('@/app/(tabs)/index').default,
  '(tabs)/meal-plan': require('@/app/(tabs)/meal-plan').default,
  '(tabs)/shopping': require('@/app/(tabs)/shopping').default,
  '(tabs)/more': require('@/app/(tabs)/more').default,
  '(tabs)/add-menu': require('@/app/(tabs)/add-menu').default,
  add: require('@/app/add').default,
  recipes: require('@/app/recipes').default,
  'recipe/[id]': require('@/app/recipe/[id]').default,
  'cook/[action]': require('@/app/cook/[action]').default,
  organize: require('@/app/organize').default,
  settings: require('@/app/settings').default,
});

// Requiring every screen transforms most of the app. On a cold CI cache that alone can exceed Jest's 5 s
// per-test timeout, so load the screens once up front (with their own timeout) instead of inside the first test.
beforeAll(() => {
  routes();
}, 60_000);

const premium = (...ids: FeatureId[]) =>
  Object.fromEntries(ids.map((id) => [id, { tier: 'premium' as const }])) as Parameters<
    typeof featureGate.setConfig
  >[0];

async function byTitle(part: string): Promise<Recipe> {
  const found = (await recipeStore.list()).find((r) => r.title.includes(part));
  if (!found) throw new Error(`no recipe matching ${part}`);
  return found;
}

beforeEach(async () => {
  mockWidth = 411;
  await require('@react-native-async-storage/async-storage').clear();
  await settingsStore.update({ features: { mealPlan: true, shopping: true, pantry: true } });
});

afterEach(() => {
  act(() => {
    featureGate.resetConfig();
    featureGate.setProvider(new LocalFreeEntitlements());
  });
});

describe('categories (spec #3)', () => {
  it('creates, renames, deletes and assigns a category, then filters by it', async () => {
    await addSampleRecipes(recipeStore);
    renderRouter(routes(), { initialUrl: '/organize' });
    expect(await screen.findByTestId('organize-screen')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('new-category-input'), 'Breakfast');
    await act(async () => fireEvent.press(screen.getByTestId('add-category-button')));
    expect(await screen.findByText('Breakfast')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('new-category-input'), '  breakfast ');
    await act(async () => fireEvent.press(screen.getByTestId('add-category-button')));
    expect(await screen.findByText(/already exists/)).toBeTruthy();
    expect(await recipeStore.listCategories()).toHaveLength(1);

    const breakfast = (await recipeStore.listCategories())[0];
    fireEvent.press(screen.getByTestId(`rename-category-${breakfast.id}`));
    fireEvent.changeText(screen.getByTestId(`rename-category-input-${breakfast.id}`), 'Brunch');
    await act(async () => fireEvent.press(screen.getByTestId(`save-category-${breakfast.id}`)));
    expect(await screen.findByText('Brunch')).toBeTruthy();

    const chicken = await byTitle('Lemon');
    const { router } = require('expo-router');
    await act(async () => router.push(`/recipe/${chicken.id}`));
    const assign = await screen.findByTestId(`assign-category-${breakfast.id}`);
    await act(async () => fireEvent.press(assign));
    expect((await recipeStore.get(chicken.id))?.categoryIds).toEqual([breakfast.id]);

    await act(async () => router.push('/recipes'));
    await screen.findByTestId(`filter-category-${breakfast.id}`);
    fireEvent.press(screen.getByTestId(`filter-category-${breakfast.id}`));
    await waitFor(() => expect(screen.queryByText(SAMPLE_RECIPES[1].title)).toBeNull());
    expect(screen.getByTestId(`recipe-item-${chicken.id}`)).toBeTruthy();

    await act(async () => router.push('/organize'));
    fireEvent.press(await screen.findByTestId(`delete-category-${breakfast.id}`));
    await act(async () => fireEvent.press(screen.getByTestId(`confirm-delete-category-${breakfast.id}`)));
    await waitFor(() => expect(screen.queryByText('Brunch')).toBeNull());
    expect((await recipeStore.get(chicken.id))?.categoryIds).toEqual([]);
  });

  it('assigns a new category from the add form and saves it on the recipe', async () => {
    renderRouter(routes(), { initialUrl: '/recipes' });
    const addButton = await screen.findByTestId('list-add-recipe-button');
    await act(async () => fireEvent.press(addButton));
    await screen.findByText('Save recipe');
    fireEvent.changeText(screen.getByTestId('add-form-category-input'), 'Breads');
    await act(async () => fireEvent.press(screen.getByTestId('add-form-category-button')));
    expect(await screen.findByText('Breads')).toBeTruthy();
    fireEvent.press(screen.getByTestId('add-rating-5'));
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Cauliflower Mac & Cheese'), 'Almond Bread');
    fireEvent.changeText(screen.getByPlaceholderText(/1 head cauliflower/), `2 cups almond flour\n1 tbsp allulose`);
    fireEvent.changeText(screen.getByPlaceholderText(/Preheat oven/), 'Mix\nBake 25 minutes');
    await act(async () => fireEvent.press(screen.getByText('Save recipe')));

    const saved = await byTitle('Almond Bread');
    expect(saved.rating).toBe(5);
    expect(saved.categoryIds).toHaveLength(1);
    expect(saved.tags).toEqual([]);
  });
});

describe('tags (spec #20)', () => {
  it('adds and removes a tag on a recipe, and renames or deletes it everywhere', async () => {
    await addSampleRecipes(recipeStore);
    const chicken = await byTitle('Lemon');
    renderRouter(routes(), { initialUrl: `/recipe/${chicken.id}` });
    fireEvent.changeText(await screen.findByTestId('add-tag-input'), 'Weeknight');
    await act(async () => fireEvent.press(screen.getByTestId('add-tag-button')));
    await waitFor(async () => expect((await recipeStore.get(chicken.id))?.tags).toContain('weeknight'));

    await act(async () => fireEvent.press(screen.getByTestId('remove-tag-dinner')));
    await waitFor(async () => expect((await recipeStore.get(chicken.id))?.tags).not.toContain('dinner'));

    const { router } = require('expo-router');
    await act(async () => router.push('/organize'));
    await screen.findByTestId('rename-tag-weeknight');
    fireEvent.press(screen.getByTestId('rename-tag-diabetic-friendly'));
    fireEvent.changeText(screen.getByTestId('rename-tag-input-diabetic-friendly'), 'family');
    await act(async () => fireEvent.press(screen.getByTestId('save-tag-diabetic-friendly')));
    const mousse = await byTitle('Allulose');
    await waitFor(async () => {
      expect((await recipeStore.get(chicken.id))?.tags).toContain('family');
      expect((await recipeStore.get(mousse.id))?.tags).toContain('family');
      expect((await recipeStore.get(mousse.id))?.tags).not.toContain('diabetic-friendly');
    });

    fireEvent.press(await screen.findByTestId('delete-tag-family'));
    await act(async () => fireEvent.press(screen.getByTestId('confirm-delete-tag-family')));
    await waitFor(async () => expect(await recipeStore.listTags()).not.toContain('family'));
  });
});

describe('search, filters, cooked history and ratings (spec #8 #9 #10 #22)', () => {
  it('searches title, ingredients, notes and tags, and combines filters', async () => {
    await addSampleRecipes(recipeStore);
    const breakfast = await recipeStore.addCategory('Breakfast');
    const chicken = await byTitle('Lemon');
    const mousse = await byTitle('Allulose');
    await recipeStore.save(
      setRating(
        setCooked({ ...chicken, notes: 'serve with a side salad', categoryIds: [breakfast.id] }, true, new Date()),
        5,
      ),
    );
    await recipeStore.save(setRating(mousse, 2));

    renderRouter(routes(), { initialUrl: '/recipes' });
    await screen.findByTestId(`recipe-item-${chicken.id}`);

    fireEvent.changeText(screen.getByTestId('search-input'), 'side salad');
    await waitFor(() => expect(screen.queryByTestId(`recipe-item-${mousse.id}`)).toBeNull());
    expect(screen.getByTestId(`recipe-item-${chicken.id}`)).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('search-input'), 'thyme');
    await waitFor(() => expect(screen.queryByTestId(`recipe-item-${mousse.id}`)).toBeNull());
    fireEvent.changeText(screen.getByTestId('search-input'), 'no-bake');
    await waitFor(() => expect(screen.getByTestId(`recipe-item-${mousse.id}`)).toBeTruthy());
    expect(screen.queryByTestId(`recipe-item-${chicken.id}`)).toBeNull();

    fireEvent.press(screen.getByTestId('clear-filters'));
    await waitFor(() => expect(screen.getByTestId(`recipe-item-${chicken.id}`)).toBeTruthy());
    expect(screen.getByTestId(`recipe-item-${mousse.id}`)).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('search-input'), 'lemon');
    fireEvent.press(screen.getByTestId('filter-cooked'));
    fireEvent.press(screen.getByTestId('filter-rating-4'));
    fireEvent.press(screen.getByTestId(`filter-category-${breakfast.id}`));
    fireEvent.press(screen.getByTestId('filter-tag-dinner'));
    await waitFor(() => expect(screen.queryByTestId(`recipe-item-${mousse.id}`)).toBeNull());
    expect(screen.getByTestId(`recipe-item-${chicken.id}`)).toBeTruthy();

    fireEvent.press(screen.getByTestId('clear-filters'));
    fireEvent.press(screen.getByTestId('filter-not-cooked'));
    await waitFor(() => expect(screen.queryByTestId(`recipe-item-${chicken.id}`)).toBeNull());
    expect(screen.getByTestId(`recipe-item-${mousse.id}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId('filter-all'));
    await waitFor(() => expect(screen.getByTestId(`recipe-item-${chicken.id}`)).toBeTruthy());
  });

  it('uses a fixed 14-day cooked-recently window (v1.0.2)', async () => {
    await addSampleRecipes(recipeStore);
    const chicken = await byTitle('Lemon');
    const mousse = await byTitle('Allulose');
    await recipeStore.save(setCooked(chicken, true, new Date(Date.now() - 20 * 86_400_000)));
    await recipeStore.save(setCooked(mousse, true, new Date(Date.now() - 10 * 86_400_000)));

    renderRouter(routes(), { initialUrl: '/recipes' });
    await screen.findByTestId('filter-recent');
    expect(screen.getByText('Cooked recently (14d)')).toBeTruthy();
    fireEvent.press(screen.getByTestId('filter-recent'));
    await waitFor(() => expect(screen.queryByTestId(`recipe-item-${chicken.id}`)).toBeNull());
    expect(screen.getByTestId(`recipe-item-${mousse.id}`)).toBeTruthy();
  });

  it('records last cooked and a history, and keeps both when unmarked', async () => {
    await addSampleRecipes(recipeStore);
    const chicken = await byTitle('Lemon');
    renderRouter(routes(), { initialUrl: `/recipe/${chicken.id}` });
    const cooked = await screen.findByTestId('cooked-toggle');
    await act(async () => fireEvent.press(cooked));
    expect(await screen.findByTestId('last-cooked')).toBeTruthy();
    expect(screen.getByText(/Cooked 1 time/)).toBeTruthy();
    const once = await recipeStore.get(chicken.id);
    expect(once?.cooked).toBe(true);
    expect(once?.cookHistory).toHaveLength(1);
    expect(once?.lastCookedAt).toBe(once?.cookHistory[0]);

    await act(async () => fireEvent.press(screen.getByTestId('log-cook-button')));
    expect(await screen.findByText(/Cooked 2 times/)).toBeTruthy();
    expect((await recipeStore.get(chicken.id))?.cookHistory).toHaveLength(2);

    const twice = await recipeStore.get(chicken.id);
    await act(async () => fireEvent.press(screen.getByTestId('cooked-toggle')));
    expect(await screen.findByText('Mark cooked')).toBeTruthy();
    expect(screen.getByText(/Cooked 2 times/)).toBeTruthy();
    expect(screen.getByTestId('last-cooked')).toBeTruthy();
    expect(screen.queryByTestId('log-cook-button')).toBeNull();
    const cleared = await recipeStore.get(chicken.id);
    expect(cleared?.cooked).toBe(false);
    expect(cleared?.cookHistory).toEqual(twice?.cookHistory);
    expect(cleared?.lastCookedAt).toBe(twice?.lastCookedAt);
  });

  it('rates from the detail, shows stars in the list, and sorts by rating', async () => {
    await addSampleRecipes(recipeStore);
    const chicken = await byTitle('Lemon');
    const mousse = await byTitle('Allulose');
    renderRouter(routes(), { initialUrl: `/recipe/${chicken.id}` });
    const star = await screen.findByTestId('detail-rating-4');
    await act(async () => fireEvent.press(star));
    expect((await recipeStore.get(chicken.id))?.rating).toBe(4);
    await act(async () => fireEvent.press(screen.getByTestId('detail-rating-4')));
    expect((await recipeStore.get(chicken.id))?.rating).toBeUndefined();
    await act(async () => fireEvent.press(screen.getByTestId('detail-rating-5')));

    await recipeStore.save(setRating(mousse, 2));
    const { router } = require('expo-router');
    await act(async () => router.push('/recipes'));
    expect(await screen.findByTestId(`recipe-rating-${chicken.id}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId('sort-rating'));
    await waitFor(() => {
      const ids = screen.getAllByTestId(/^recipe-item-/).map((node) => String(node.props.testID));
      expect(ids[0]).toBe(`recipe-item-${chicken.id}`);
    });
    fireEvent.press(screen.getByTestId('sort-title'));
    await waitFor(() => {
      const ids = screen.getAllByTestId(/^recipe-item-/).map((node) => String(node.props.testID));
      expect(ids[0]).toBe(`recipe-item-${mousse.id}`);
    });
  });
});

describe('settings show/hide and locked organize features', () => {
  it('hides optional tabs from the settings switches and keeps the recipe list', async () => {
    renderRouter(routes(), { initialUrl: '/' });
    expect(await screen.findByText('Meal Plan')).toBeTruthy();
    expect(screen.getByText('Shopping')).toBeTruthy();
    fireEvent.press(screen.getByTestId('settings-button'));
    expect(await screen.findByTestId('feature-toggle-pantry')).toBeTruthy();
    await act(async () => {
      fireEvent(screen.getByTestId('feature-toggle-mealPlan'), 'valueChange', false);
      fireEvent(screen.getByTestId('feature-toggle-shopping'), 'valueChange', false);
      fireEvent(screen.getByTestId('feature-toggle-pantry'), 'valueChange', false);
    });
    expect((await settingsStore.get()).features).toEqual({ mealPlan: false, shopping: false, pantry: false });
    // v1.0.2: no cooked-recently setting any more.
    expect(screen.queryByTestId('cooked-recently-input')).toBeNull();

    const { router } = require('expo-router');
    await act(async () => router.back());
    await waitFor(() => expect(screen.queryByText('Meal Plan')).toBeNull());
    expect(screen.queryByText('Shopping')).toBeNull();
    expect(screen.getByTestId('tab-add-button')).toBeTruthy();
    expect(screen.getByTestId('add-recipe-button')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('home-existing')));
    expect(await screen.findByText('Cooked recently (14d)')).toBeTruthy();
  });

  it('hides category, tag and rating controls when those features are locked', async () => {
    featureGate.setProvider(new NoEntitlements());
    featureGate.setConfig(premium('categories', 'tags', 'ratings'));
    await addSampleRecipes(recipeStore);
    renderRouter(routes(), { initialUrl: '/recipes' });
    await screen.findByTestId('search-input');
    expect(screen.queryByTestId('organize-button')).toBeNull();
    expect(screen.queryByTestId('filter-rating-5')).toBeNull();
    expect(screen.queryByTestId('sort-rating')).toBeNull();
    expect(screen.getByTestId('filter-cooked')).toBeTruthy();

    const chicken = await byTitle('Lemon');
    const { router } = require('expo-router');
    await act(async () => router.push(`/recipe/${chicken.id}`));
    expect(await screen.findByTestId('cooked-toggle')).toBeTruthy();
    expect(screen.queryByTestId('detail-rating')).toBeNull();
    expect(screen.queryByTestId('add-tag-input')).toBeNull();

    await act(async () => router.push('/add'));
    await screen.findByText('Save recipe');
    expect(screen.queryByText('Tags (comma separated)')).toBeNull();
    expect(screen.queryByText('Categories')).toBeNull();
    expect(screen.queryByTestId('add-rating-1')).toBeNull();

    await act(async () => router.push('/organize'));
    expect(await screen.findByTestId('organize-unavailable')).toBeTruthy();
  });
});

describe('expanded width', () => {
  beforeEach(() => {
    mockWidth = 900;
  });

  it('keeps search and filters next to the open recipe', async () => {
    await addSampleRecipes(recipeStore);
    const chicken = await byTitle('Lemon');
    renderRouter(routes(), { initialUrl: '/recipes' });
    expect(await screen.findByTestId('recipes-layout-dual')).toBeTruthy();
    expect(screen.getByTestId('recipe-filters')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId(`recipe-item-${chicken.id}`)));
    expect(await screen.findByTestId('recipe-detail')).toBeTruthy();
    expect(screen).toHavePathname('/recipes');
    const detail = within(screen.getByTestId('recipe-detail'));
    expect(detail.getByTestId('detail-rating')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('search-input'), 'no-such-recipe');
    expect(await screen.findByText('No recipes match.')).toBeTruthy();
    expect(screen.getByTestId('recipe-detail')).toBeTruthy();
  });
});
