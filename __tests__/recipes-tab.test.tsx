/**
 * Recipes tab (v1.0.5): categories (spec #3) with expand/collapse, rename/add/delete; Advanced search sheet
 * (#9 filters, #22 ratings, sort); search (#8); tags (#20) on the add/edit/detail screens; cooked history (#10).
 * The “Manage categories & tags” screen is gone. Optional-tab show/hide toggles live in Settings and are covered too.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Alert } from 'react-native';
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
  'recipe/[id]/index': require('@/app/recipe/[id]/index').default,
  'cook/[action]': require('@/app/cook/[action]').default,
  'recipe/[id]/edit': require('@/app/recipe/[id]/edit').default,
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

async function categoryByName(name: string) {
  const found = (await recipeStore.listCategories()).find((c) => c.name === name);
  if (!found) throw new Error(`no category ${name}`);
  return found;
}

describe('Recipes tab categories (v1.0.5)', () => {
  it('opens with Breakfast, Lunch, Dinner; Uncategorized only when non-empty; expand shows names + stars', async () => {
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('recipe-categories');
    await waitFor(async () => expect((await recipeStore.listCategories()).map((c) => c.name)).toEqual(['Breakfast', 'Lunch', 'Dinner']));
    const tree = JSON.stringify(screen.toJSON());
    const order = ['Breakfast', 'Lunch', 'Dinner'].map((n) => tree.indexOf(`"${n}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(screen.queryByTestId('category-header-uncategorized')).toBeNull();
    screen.unmount();

    await addSampleRecipes(recipeStore);
    const chicken = await byTitle('Lemon');
    const mousse = await byTitle('Allulose');
    const dinner = await categoryByName('Dinner');
    await recipeStore.save(setRating({ ...chicken, categoryIds: [dinner.id] }, 4));
    renderRouter(routes(), { initialUrl: '/' });
    const dinnerHeader = await screen.findByTestId(`category-header-${dinner.id}`);
    expect(within(dinnerHeader).getByText('1')).toBeTruthy(); // count
    expect(screen.getByTestId('category-header-uncategorized')).toBeTruthy();
    expect(screen.queryByTestId(`recipe-item-${chicken.id}`)).toBeNull(); // collapsed

    await act(async () => fireEvent.press(dinnerHeader));
    const row = await screen.findByTestId(`recipe-item-${chicken.id}`);
    expect(within(row).getByText(chicken.title)).toBeTruthy();
    expect(within(row).getByTestId(`recipe-rating-${chicken.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`recipe-item-${mousse.id}`)).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('category-header-uncategorized')));
    expect(await screen.findByTestId(`recipe-item-${mousse.id}`)).toBeTruthy();
    await act(async () => fireEvent.press(dinnerHeader));
    await waitFor(() => expect(screen.queryByTestId(`recipe-item-${chicken.id}`)).toBeNull());

    // An empty category says so when opened.
    const lunch = await categoryByName('Lunch');
    await act(async () => fireEvent.press(screen.getByTestId(`category-header-${lunch.id}`)));
    expect(await screen.findByTestId(`category-empty-${lunch.id}`)).toBeTruthy();

    // Tapping a recipe opens it.
    await act(async () => fireEvent.press(screen.getByTestId(`recipe-item-${mousse.id}`)));
    expect(screen).toHavePathname(`/recipe/${mousse.id}`);
  });

  it('renames, adds and deletes categories from the Recipes tab (delete confirms, recipes → Uncategorized)', async () => {
    await addSampleRecipes(recipeStore);
    await recipeStore.prepareCategories();
    const chicken = await byTitle('Lemon');
    const breakfast = await categoryByName('Breakfast');
    await recipeStore.save({ ...chicken, categoryIds: [breakfast.id] });
    renderRouter(routes(), { initialUrl: '/' });

    fireEvent.press(await screen.findByTestId(`rename-category-${breakfast.id}`));
    fireEvent.changeText(screen.getByTestId(`rename-category-input-${breakfast.id}`), 'lunch');
    await act(async () => fireEvent.press(screen.getByTestId(`save-category-${breakfast.id}`)));
    expect(await screen.findByTestId('category-error')).toHaveTextContent(/already exists/);
    fireEvent.changeText(screen.getByTestId(`rename-category-input-${breakfast.id}`), 'Brunch');
    await act(async () => fireEvent.press(screen.getByTestId(`save-category-${breakfast.id}`)));
    expect(await screen.findByText('Brunch')).toBeTruthy();
    expect((await categoryByName('Brunch')).id).toBe(breakfast.id);

    expect(screen.getByTestId('add-category-button')).toHaveTextContent('New category');
    expect(screen.getByTestId('list-add-recipe-button')).toHaveTextContent('Add recipe');
    await act(async () => fireEvent.press(screen.getByTestId('add-category-button')));
    fireEvent.changeText(screen.getByTestId('new-category-input'), 'Snacks');
    // Typing a category name must keep Add recipe on screen (v1.0.9).
    expect(screen.getByTestId('list-add-recipe-button')).toHaveTextContent('Add recipe');
    // The name field shrinks so Add and Cancel keep their natural width at 360dp (v1.0.9).
    const { StyleSheet } = require('react-native');
    const field = StyleSheet.flatten(screen.getByTestId('new-category-input').props.style);
    expect(field.flexGrow).toBe(1);
    expect(field.flexShrink).toBe(1);
    expect(field.minWidth).toBe(0);
    const addBtn = StyleSheet.flatten(screen.getByTestId('save-new-category').props.style);
    const cancelBtn = StyleSheet.flatten(screen.getByTestId('cancel-new-category').props.style);
    expect(addBtn.flexGrow).toBe(0);
    expect(addBtn.flexShrink).toBe(0);
    expect(cancelBtn.flexGrow).toBe(0);
    expect(cancelBtn.flexShrink).toBe(0);
    expect(screen.getByTestId('cancel-new-category')).toHaveTextContent('Cancel');
    await act(async () => fireEvent.press(screen.getByTestId('save-new-category')));
    expect(await screen.findByText('Snacks')).toBeTruthy();
    expect((await recipeStore.listCategories()).map((c) => c.name)).toEqual(['Brunch', 'Lunch', 'Dinner', 'Snacks']);

    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    fireEvent.press(screen.getByTestId(`delete-category-${breakfast.id}`));
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alert.mock.calls[0];
    expect(title).toBe('Delete “Brunch”?');
    expect(message).toMatch(/1 recipe will move to Uncategorized/);
    expect(await recipeStore.countInCategory(breakfast.id)).toBe(1); // nothing happens before confirming
    await act(async () => buttons!.find((b) => b.text === 'Delete')!.onPress!());
    await waitFor(() => expect(screen.queryByText('Brunch')).toBeNull());
    expect((await recipeStore.get(chicken.id))?.categoryIds).toEqual([]);
    expect(await screen.findByTestId('category-header-uncategorized')).toBeTruthy();
    alert.mockRestore();
  });

  it('sets several categories on add (multi-select, plus a new one) and on edit, with tags on the edit screen', async () => {
    renderRouter(routes(), { initialUrl: '/recipes' });
    await screen.findByTestId('recipe-categories');
    const lunch = await categoryByName('Lunch');
    const dinner = await categoryByName('Dinner');
    await act(async () => fireEvent.press(screen.getByTestId('list-add-recipe-button')));
    await screen.findByText('Save recipe');
    // v1.0.6: no "Uncategorized" chip — it is automatic when nothing is selected.
    expect(screen.queryByTestId('add-category-none')).toBeNull();
    expect(screen.getByTestId('add-category-uncategorized-hint')).toBeTruthy();
    fireEvent.press(await screen.findByTestId(`add-category-${lunch.id}`));
    fireEvent.press(screen.getByTestId(`add-category-${dinner.id}`)); // multi-select: Lunch AND Dinner
    expect(screen.queryByTestId('add-category-uncategorized-hint')).toBeNull();
    expect(screen.getByTestId(`add-category-${dinner.id}`).props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByText('✓ Dinner')).toBeTruthy();
    fireEvent.press(screen.getByTestId('add-rating-5'));
    fireEvent.changeText(screen.getByPlaceholderText('e.g. Cauliflower Mac & Cheese'), 'Almond Bread');
    fireEvent.changeText(screen.getByPlaceholderText(/1 head cauliflower/), `2 cups almond flour\n1 tbsp allulose`);
    fireEvent.changeText(screen.getByPlaceholderText(/Preheat oven/), 'Mix\nBake 25 minutes');
    fireEvent.changeText(screen.getByTestId('add-form-tags-input'), 'bread, Quick');
    await act(async () => fireEvent.press(screen.getByText('Save recipe')));
    const saved = await byTitle('Almond Bread');
    expect(saved.rating).toBe(5);
    expect(saved.categoryIds).toEqual([lunch.id, dinner.id]);
    expect(saved.tags).toEqual(['bread', 'quick']);

    // A brand-new category from the add form becomes the choice.
    const { router } = require('expo-router');
    await act(async () => router.push('/add'));
    await screen.findByText('Save recipe');
    fireEvent.changeText(screen.getByTestId('add-form-category-input'), 'Breads');
    await act(async () => fireEvent.press(screen.getByTestId('add-form-category-button')));
    const breads = await categoryByName('Breads');
    await waitFor(() => expect(screen.getByTestId(`add-category-${breads.id}`)).toBeTruthy());
    await act(async () => router.back());

    // Edit: change category and tags.
    await act(async () => router.push(`/recipe/${saved.id}/edit`));
    await screen.findByTestId('recipe-editor');
    const editor = within(screen.getByTestId('recipe-editor'));
    fireEvent.press(editor.getByTestId(`edit-category-${lunch.id}`));
    fireEvent.press(editor.getByTestId(`edit-category-${dinner.id}`)); // both off → Uncategorized
    expect(editor.getByTestId('edit-category-uncategorized-hint')).toBeTruthy();
    fireEvent.changeText(editor.getByTestId('add-tag-input'), 'Weeknight');
    fireEvent.press(editor.getByTestId('add-tag-button'));
    fireEvent.press(editor.getByTestId('remove-tag-quick'));
    await act(async () => fireEvent.press(editor.getByTestId('save-recipe-button')));
    await waitFor(async () => {
      const edited = await recipeStore.get(saved.id);
      expect(edited?.categoryIds).toEqual([]);
      expect(edited?.tags).toEqual(['bread', 'weeknight']);
    });
  });

  it('recipe detail toggles several categories; none selected = Uncategorized (v1.0.6)', async () => {
    await addSampleRecipes(recipeStore);
    await recipeStore.prepareCategories();
    const chicken = await byTitle('Lemon');
    const breakfast = await categoryByName('Breakfast');
    const dinner = await categoryByName('Dinner');
    renderRouter(routes(), { initialUrl: `/recipe/${chicken.id}` });
    const assignBreakfast = await screen.findByTestId(`assign-category-${breakfast.id}`);
    expect(screen.queryByTestId('assign-category-none')).toBeNull();
    expect(screen.getByTestId('assign-category-uncategorized-hint')).toBeTruthy();
    await act(async () => fireEvent.press(assignBreakfast));
    expect((await recipeStore.get(chicken.id))?.categoryIds).toEqual([breakfast.id]);
    await act(async () => fireEvent.press(screen.getByTestId(`assign-category-${dinner.id}`)));
    expect((await recipeStore.get(chicken.id))?.categoryIds).toEqual([breakfast.id, dinner.id]);
    expect(screen.getByTestId(`assign-category-${breakfast.id}`).props.accessibilityState).toMatchObject({ checked: true });
    await act(async () => fireEvent.press(screen.getByTestId(`assign-category-${breakfast.id}`)));
    expect((await recipeStore.get(chicken.id))?.categoryIds).toEqual([dinner.id]);
    await act(async () => fireEvent.press(screen.getByTestId(`assign-category-${dinner.id}`)));
    expect((await recipeStore.get(chicken.id))?.categoryIds).toEqual([]);
    expect(screen.getByTestId('assign-category-uncategorized-hint')).toBeTruthy();
  });

  it('a recipe in several categories appears under each of them on the Recipes tab (v1.0.6)', async () => {
    await addSampleRecipes(recipeStore);
    await recipeStore.prepareCategories();
    const chicken = await byTitle('Lemon');
    const lunch = await categoryByName('Lunch');
    const dinner = await categoryByName('Dinner');
    await recipeStore.save({ ...chicken, categoryIds: [lunch.id, dinner.id] });
    renderRouter(routes(), { initialUrl: '/' });
    const lunchHeader = await screen.findByTestId(`category-header-${lunch.id}`);
    const dinnerHeader = screen.getByTestId(`category-header-${dinner.id}`);
    expect(within(lunchHeader).getByText('1')).toBeTruthy();
    expect(within(dinnerHeader).getByText('1')).toBeTruthy();
    await act(async () => fireEvent.press(lunchHeader));
    await act(async () => fireEvent.press(dinnerHeader));
    expect(within(screen.getByTestId(`category-${lunch.id}`)).getByTestId(`recipe-item-${chicken.id}`)).toBeTruthy();
    expect(within(screen.getByTestId(`category-${dinner.id}`)).getByTestId(`recipe-item-${chicken.id}`)).toBeTruthy();
    // Only the other sample is uncategorized.
    await act(async () => fireEvent.press(screen.getByTestId('category-header-uncategorized')));
    expect(within(screen.getByTestId('category-uncategorized')).queryByTestId(`recipe-item-${chicken.id}`)).toBeNull();
  });

  it('has no “Manage categories & tags”, “Import from link” or “Select recipes for PDF” on the page', async () => {
    await addSampleRecipes(recipeStore);
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('recipe-categories');
    for (const id of ['organize-button', 'import-recipe-button', 'pdf-select-button', 'recipe-filters'])
      expect(screen.queryByTestId(id)).toBeNull();
    for (const text of ['Manage categories & tags', 'Import from link', 'Select recipes for PDF'])
      expect(screen.queryByText(text)).toBeNull();
    // Filters are off the page until Advanced search opens.
    expect(screen.queryByTestId('filter-cooked')).toBeNull();
    expect(screen.queryByText('Minimum rating')).toBeNull();
    // The + menu still has Import Link and Share Recipes.
    await act(async () => fireEvent.press(screen.getByTestId('tab-add-button')));
    expect(screen.getByTestId('add-menu-import-link')).toBeTruthy();
    expect(screen.getByTestId('add-menu-share-recipe')).toBeTruthy();
    // Settings / More have no organize entry either.
    await act(async () => fireEvent.press(screen.getByTestId('add-menu-backdrop')));
    fireEvent.press(screen.getByTestId('settings-button'));
    expect(await screen.findByTestId('feature-toggle-pantry')).toBeTruthy();
    expect(screen.queryByText(/Manage categories/)).toBeNull();
  });
});

describe('tags (spec #20)', () => {
  it('adds and removes a tag on a recipe from its detail', async () => {
    await addSampleRecipes(recipeStore);
    const chicken = await byTitle('Lemon');
    renderRouter(routes(), { initialUrl: `/recipe/${chicken.id}` });
    fireEvent.changeText(await screen.findByTestId('add-tag-input'), 'Weeknight');
    await act(async () => fireEvent.press(screen.getByTestId('add-tag-button')));
    await waitFor(async () => expect((await recipeStore.get(chicken.id))?.tags).toContain('weeknight'));
    await act(async () => fireEvent.press(screen.getByTestId('remove-tag-dinner')));
    await waitFor(async () => expect((await recipeStore.get(chicken.id))?.tags).not.toContain('dinner'));
  });
});

describe('search and Advanced search (spec #8 #9 #10 #22)', () => {
  it('typing a search shows the flat list of matches; clearing it brings the categories back', async () => {
    await addSampleRecipes(recipeStore);
    const chicken = await byTitle('Lemon');
    const mousse = await byTitle('Allulose');
    await recipeStore.save({ ...chicken, notes: 'serve with a side salad' });
    renderRouter(routes(), { initialUrl: '/recipes' });
    await screen.findByTestId('recipe-categories');
    expect(screen.getByTestId('search-input').props.placeholder).toBe('Search recipes');

    fireEvent.changeText(screen.getByTestId('search-input'), 'side salad');
    await waitFor(() => expect(screen.getByTestId(`recipe-item-${chicken.id}`)).toBeTruthy());
    expect(screen.queryByTestId(`recipe-item-${mousse.id}`)).toBeNull();
    expect(screen.queryByTestId('recipe-categories')).toBeNull();
    fireEvent.changeText(screen.getByTestId('search-input'), 'no-bake');
    await waitFor(() => expect(screen.getByTestId(`recipe-item-${mousse.id}`)).toBeTruthy());
    expect(screen.queryByTestId(`recipe-item-${chicken.id}`)).toBeNull();
    fireEvent.changeText(screen.getByTestId('search-input'), 'zzz-nothing');
    expect(await screen.findByText('No recipes match.')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('search-input'), '');
    expect(await screen.findByTestId('recipe-categories')).toBeTruthy();
  });

  it('filters live in the Advanced search sheet, with an indicator on the button and Reset', async () => {
    await addSampleRecipes(recipeStore);
    const chicken = await byTitle('Lemon');
    const mousse = await byTitle('Allulose');
    await recipeStore.save(setRating(setCooked(chicken, true, new Date()), 5));
    await recipeStore.save(setRating(mousse, 2));
    renderRouter(routes(), { initialUrl: '/recipes' });
    await screen.findByTestId('recipe-categories');
    expect(screen.queryByTestId('advanced-search-indicator')).toBeNull();
    expect(screen.queryByTestId('advanced-search-sheet')).toBeNull();

    await act(async () => fireEvent.press(screen.getByTestId('advanced-search-button')));
    const sheet = within(await screen.findByTestId('advanced-search-sheet'));
    expect(sheet.getByText('Advanced search')).toBeTruthy();
    expect(sheet.getByText('Cooked recently (14d)')).toBeTruthy();
    expect(sheet.getByTestId('clear-filters')).toBeDisabled();
    fireEvent.press(sheet.getByTestId('filter-cooked'));
    expect(await screen.findByTestId('advanced-search-indicator')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('advanced-search-done')));
    await waitFor(() => expect(screen.queryByTestId('advanced-search-sheet')).toBeNull());
    // A filter shows the matching recipes as a list.
    expect(await screen.findByTestId(`recipe-item-${chicken.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`recipe-item-${mousse.id}`)).toBeNull();

    await act(async () => fireEvent.press(screen.getByTestId('advanced-search-button')));
    fireEvent.press(screen.getByTestId('filter-not-cooked'));
    fireEvent.press(screen.getByTestId('filter-rating-2'));
    fireEvent.press(screen.getByTestId('filter-tag-no-bake'));
    await waitFor(() => expect(screen.queryByTestId(`recipe-item-${chicken.id}`)).toBeNull());
    expect(screen.getByTestId(`recipe-item-${mousse.id}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId('filter-rating-3'));
    expect(await screen.findByText('No recipes match.')).toBeTruthy();

    // Reset returns everything to default and the page to categories.
    await act(async () => fireEvent.press(screen.getByTestId('clear-filters')));
    await waitFor(() => expect(screen.queryByTestId('advanced-search-indicator')).toBeNull());
    await act(async () => fireEvent.press(screen.getByTestId('advanced-search-done')));
    expect(await screen.findByTestId('recipe-categories')).toBeTruthy();
  });

  it('sort is in the sheet: non-default sort lights the indicator and orders recipes inside a category', async () => {
    await addSampleRecipes(recipeStore);
    const chicken = await byTitle('Lemon');
    const mousse = await byTitle('Allulose');
    await recipeStore.save(setRating(chicken, 5));
    await recipeStore.save(setRating(mousse, 2));
    renderRouter(routes(), { initialUrl: '/recipes' });
    const uncategorized = await screen.findByTestId('category-header-uncategorized');
    await act(async () => fireEvent.press(uncategorized));
    const ids = () => screen.getAllByTestId(/^recipe-item-/).map((node) => String(node.props.testID));
    await act(async () => fireEvent.press(screen.getByTestId('advanced-search-button')));
    fireEvent.press(screen.getByTestId('sort-rating'));
    await waitFor(() => expect(ids()[0]).toBe(`recipe-item-${chicken.id}`));
    expect(screen.getByTestId('advanced-search-indicator')).toBeTruthy();
    expect(screen.getByTestId('recipe-categories')).toBeTruthy(); // sort alone keeps the categories
    fireEvent.press(screen.getByTestId('sort-title'));
    await waitFor(() => expect(ids()[0]).toBe(`recipe-item-${mousse.id}`));
    fireEvent.press(screen.getByTestId('sort-newest'));
    await waitFor(() => expect(screen.queryByTestId('advanced-search-indicator')).toBeNull());
  });

  it('uses a fixed 14-day cooked-recently window (v1.0.2)', async () => {
    await addSampleRecipes(recipeStore);
    const chicken = await byTitle('Lemon');
    const mousse = await byTitle('Allulose');
    await recipeStore.save(setCooked(chicken, true, new Date(Date.now() - 20 * 86_400_000)));
    await recipeStore.save(setCooked(mousse, true, new Date(Date.now() - 10 * 86_400_000)));
    renderRouter(routes(), { initialUrl: '/recipes' });
    const advanced = await screen.findByTestId('advanced-search-button');
    await act(async () => fireEvent.press(advanced));
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

  it('rates from the detail and shows stars next to the name in its category', async () => {
    await addSampleRecipes(recipeStore);
    const chicken = await byTitle('Lemon');
    renderRouter(routes(), { initialUrl: `/recipe/${chicken.id}` });
    const star = await screen.findByTestId('detail-rating-4');
    await act(async () => fireEvent.press(star));
    expect((await recipeStore.get(chicken.id))?.rating).toBe(4);
    await act(async () => fireEvent.press(screen.getByTestId('detail-rating-4')));
    expect((await recipeStore.get(chicken.id))?.rating).toBeUndefined();
    await act(async () => fireEvent.press(screen.getByTestId('detail-rating-5')));
    const { router } = require('expo-router');
    await act(async () => router.push('/recipes'));
    const uncategorized = await screen.findByTestId('category-header-uncategorized');
    await act(async () => fireEvent.press(uncategorized));
    expect(await screen.findByTestId(`recipe-rating-${chicken.id}`)).toBeTruthy();
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
    expect(screen.queryByTestId('cooked-recently-input')).toBeNull();

    const { router } = require('expo-router');
    await act(async () => router.back());
    await waitFor(() => expect(screen.queryByText('Meal Plan')).toBeNull());
    expect(screen.queryByText('Shopping')).toBeNull();
    expect(screen.getByTestId('tab-add-button')).toBeTruthy();
    expect(screen.getByTestId('search-input')).toBeTruthy();
    expect(await screen.findByTestId('recipe-categories')).toBeTruthy();
  });

  it('locked categories: the Recipes tab is the flat list (core recipes never gated); locked tags/ratings hide their controls', async () => {
    featureGate.setProvider(new NoEntitlements());
    featureGate.setConfig(premium('categories', 'tags', 'ratings'));
    await addSampleRecipes(recipeStore);
    renderRouter(routes(), { initialUrl: '/recipes' });
    const chicken = await byTitle('Lemon');
    expect(await screen.findByTestId(`recipe-item-${chicken.id}`)).toBeTruthy();
    expect(screen.queryByTestId('recipe-categories')).toBeNull();
    expect(await recipeStore.listCategories()).toEqual([]); // no defaults seeded while locked
    expect(screen.getByTestId('list-add-recipe-button')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('advanced-search-button')));
    expect(screen.queryByTestId('filter-rating-5')).toBeNull();
    expect(screen.queryByTestId('sort-rating')).toBeNull();
    expect(screen.queryByText('Tags')).toBeNull();
    expect(screen.getByTestId('filter-cooked')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('advanced-search-done')));

    const { router } = require('expo-router');
    await act(async () => router.push(`/recipe/${chicken.id}`));
    expect(await screen.findByTestId('cooked-toggle')).toBeTruthy();
    expect(screen.queryByTestId('detail-rating')).toBeNull();
    expect(screen.queryByTestId('add-tag-input')).toBeNull();

    await act(async () => router.push('/add'));
    await screen.findByText('Save recipe');
    expect(screen.queryByText('Tags (comma separated)')).toBeNull();
    expect(screen.queryByText('Category')).toBeNull();
    expect(screen.queryByTestId('add-rating-1')).toBeNull();
  });
});

describe('expanded width', () => {
  beforeEach(() => {
    mockWidth = 900;
  });

  it('keeps search and categories next to the open recipe', async () => {
    await addSampleRecipes(recipeStore);
    const chicken = await byTitle('Lemon');
    renderRouter(routes(), { initialUrl: '/recipes' });
    expect(await screen.findByTestId('recipes-layout-dual')).toBeTruthy();
    const uncategorized = await screen.findByTestId('category-header-uncategorized');
    await act(async () => fireEvent.press(uncategorized));
    await act(async () => fireEvent.press(screen.getByTestId(`recipe-item-${chicken.id}`)));
    expect(await screen.findByTestId('recipe-detail')).toBeTruthy();
    expect(screen).toHavePathname('/recipes');
    expect(screen.getByTestId('recipe-categories')).toBeTruthy();
    const detail = within(screen.getByTestId('recipe-detail'));
    expect(detail.getByTestId('detail-rating')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('search-input'), 'no-such-recipe');
    expect(await screen.findByText('No recipes match.')).toBeTruthy();
    expect(screen.getByTestId('recipe-detail')).toBeTruthy();
  });
});
