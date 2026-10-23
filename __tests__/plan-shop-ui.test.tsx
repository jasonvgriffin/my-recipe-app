/**
 * Meal plan, shopping list, and grocery run (spec #11, #12, #18, #23).
 * Each screen is exercised at compact (411dp) and expanded (900dp).
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useKeepAwake } from 'expo-keep-awake';

import { GroceryRunView } from '@/components/grocery-run-view';
import { ShoppingListView } from '@/components/shopping-list-view';
import { featureGate, LocalFreeEntitlements, NoEntitlements } from '@/entitlements';
import { addDays, formatMonthYear, formatShortDate, monthGrid, startOfWeek, toIsoDate } from '@/lib/dates';
import { setPendingMeal } from '@/lib/meal-plan';
import { mealPlanStore } from '@/storage/meal-plan';
import { pantryStore } from '@/storage/pantry';
import { recipeStore } from '@/storage/recipes';
import { settingsStore } from '@/storage/settings';
import { addSampleRecipes } from '../test-helpers/sample-recipes';

const COMPACT = 411;
const EXPANDED = 900;

let mockWidth = COMPACT;
jest.mock('@/hooks/use-window-size-class', () => {
  const actual = jest.requireActual('@/hooks/use-window-size-class');
  return { ...actual, useWindowSizeClass: () => actual.getWindowLayout(mockWidth, 900) };
});

const MealPlan = () => require('@/app/(tabs)/meal-plan').default;
const DayRoute = () => require('@/app/meal-plan/[date]').default;
const Shopping = () => require('@/app/(tabs)/shopping').default;
const Grocery = () => require('@/app/grocery-run').default;
const Recipe = () => require('@/app/recipe/[id]').default;

async function chicken() {
  await addSampleRecipes(recipeStore);
  const list = await recipeStore.list();
  const found = list.find((r) => r.title.includes('Chicken'));
  if (!found) throw new Error('seed chicken missing');
  return found;
}

beforeEach(async () => {
  mockWidth = COMPACT;
  setPendingMeal(null);
  await require('@react-native-async-storage/async-storage').clear();
  act(() => {
    featureGate.resetConfig();
    featureGate.setProvider(new LocalFreeEntitlements());
  });
  (useKeepAwake as jest.Mock).mockClear();
});

describe.each([
  ['compact', COMPACT],
  ['expanded', EXPANDED],
])('meal plan at %s', (_label, width) => {
  beforeEach(() => {
    mockWidth = width;
  });

  it('assigns, moves, and removes a recipe', async () => {
    await addSampleRecipes(recipeStore);
    renderRouter({ index: MealPlan(), 'meal-plan/[date]': DayRoute() }, { initialUrl: '/' });
    expect(await screen.findByTestId(width >= 600 ? 'meal-plan-layout-dual' : 'meal-plan-layout-single')).toBeTruthy();

    const today = toIsoDate(new Date());
    if (width < 600) {
      expect(screen.queryByTestId('day-plan')).toBeNull();
      await act(async () => fireEvent.press(screen.getByTestId(`day-${today}`)));
      expect(screen).toHavePathname(`/meal-plan/${today}`);
    }
    expect(await screen.findByText('Nothing planned')).toBeTruthy();
    expect(screen.queryByTestId('recipe-search')).toBeNull();
    expect(screen.queryByTestId('custom-entry-title')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('add-recipe-toggle')));
    await act(async () => fireEvent.press(await screen.findByLabelText('Add Lemon Herb Chicken Thighs')));
    expect(await screen.findByLabelText('Remove Lemon Herb Chicken Thighs')).toBeTruthy();
    expect(screen.getByText('6 servings')).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByLabelText('Increase servings for Lemon Herb Chicken Thighs')));
    expect(await screen.findByText('7 servings')).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByLabelText('Set Lemon Herb Chicken Thighs to Lunch')));
    expect(screen.getAllByText('Lunch').length).toBeGreaterThan(0);
    expect(await mealPlanStore.entriesForDates([today])).toHaveLength(0);

    await act(async () => fireEvent.press(screen.getByTestId('save-planned-meal')));
    expect(await mealPlanStore.entriesForDates([today])).toHaveLength(1);

    if (width < 600) {
      await waitFor(() => expect(screen).toHavePathname('/'));
      await act(async () => fireEvent.press(screen.getByTestId(`day-${today}`)));
      expect(screen).toHavePathname(`/meal-plan/${today}`);
    }

    await act(async () => fireEvent.press(await screen.findByLabelText('Move Lemon Herb Chicken Thighs to the next day')));
    await waitFor(() => expect(screen.queryByLabelText('Remove Lemon Herb Chicken Thighs')).toBeNull());

    const next = addDays(today, 1);
    if (width >= 600) {
      if (!screen.queryByTestId(`day-${next}`)) fireEvent.press(screen.getByTestId('cal-next'));
      await act(async () => fireEvent.press(screen.getByTestId(`day-${next}`)));
      expect(await screen.findByLabelText('Remove Lemon Herb Chicken Thighs')).toBeTruthy();
      await act(async () => fireEvent.press(screen.getByLabelText('Remove Lemon Herb Chicken Thighs')));
      await waitFor(() => expect(screen.queryByLabelText('Remove Lemon Herb Chicken Thighs')).toBeNull());
    } else {
      expect(await mealPlanStore.entriesForDates([next])).toHaveLength(1);
    }
  });

  it('shows the “Tap a day to add meal plan” hint above the month name, with no Today button', async () => {
    renderRouter({ index: MealPlan() }, { initialUrl: '/' });
    const hint = await screen.findByTestId('meal-calendar-hint');
    expect(hint).toHaveTextContent('Tap a day to add meal plan');
    expect(screen.queryByTestId('jump-today')).toBeNull();
    expect(screen.queryByText('Today')).toBeNull();
    const tree = JSON.stringify(screen.toJSON());
    const hintAt = tree.indexOf('"testID":"meal-calendar-hint"');
    const labelAt = tree.indexOf('"testID":"calendar-label"');
    expect(hintAt).toBeGreaterThanOrEqual(0);
    expect(labelAt).toBeGreaterThan(hintAt);

    const now = new Date();
    const today = toIsoDate(now);
    const other = monthGrid(now.getFullYear(), now.getMonth()).find((iso) => iso !== today);
    expect(other).toBeTruthy();
    const todayStyle = StyleSheet.flatten(screen.getByTestId(`day-${today}`).props.style);
    const otherStyle = StyleSheet.flatten(screen.getByTestId(`day-${other}`).props.style);
    expect(todayStyle.backgroundColor).toBeTruthy();
    expect(todayStyle.backgroundColor).not.toBe(otherStyle.backgroundColor);
  });

  it('shows the month view only (no week view) and pages by month', async () => {
    const recipe = await chicken();
    const today = toIsoDate(new Date());
    await mealPlanStore.addEntry(today, recipe.id, 'dinner');
    renderRouter({ index: MealPlan() }, { initialUrl: '/' });
    const now = new Date();
    expect(await screen.findByText(formatMonthYear(now.getFullYear(), now.getMonth()))).toBeTruthy();
    expect(screen.queryByTestId('view-week')).toBeNull();
    expect(screen.queryByTestId('view-month')).toBeNull();
    expect(screen.queryByText(/^Week of/)).toBeNull();
    expect((await screen.findAllByText(recipe.title)).length).toBeGreaterThan(0); // planned meal shown in its day cell
    fireEvent.press(screen.getByTestId('cal-next'));
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    expect(await screen.findByText(formatMonthYear(nextMonth.getFullYear(), nextMonth.getMonth()))).toBeTruthy();
    expect(screen.queryByTestId('jump-today')).toBeNull();
    fireEvent.press(screen.getByTestId('cal-prev'));
    expect(await screen.findByText(formatMonthYear(now.getFullYear(), now.getMonth()))).toBeTruthy();
  });
});

describe('meal plan category chips', () => {
  beforeEach(() => {
    mockWidth = EXPANDED;
  });

  it('renders recipe categories as add and card chips, Dinner first selected, with no Snack or Uncategorized chip', async () => {
    await recipeStore.prepareCategories();
    await recipeStore.addCategory('Get me laid');
    const cats = await recipeStore.listCategories();
    expect(cats.map((c) => c.name)).toEqual(['Breakfast', 'Lunch', 'Dinner', 'Get me laid']);
    const recipe = await chicken();
    const today = toIsoDate(new Date());
    const dinner = cats.find((c) => c.name === 'Dinner');
    if (!dinner) throw new Error('Dinner category missing');
    const placed = await mealPlanStore.placeEntry({ date: today, recipeId: recipe.id, slot: dinner.id });

    renderRouter({ index: MealPlan(), 'meal-plan/[date]': DayRoute() }, { initialUrl: '/' });
    await act(async () => fireEvent.press(await screen.findByTestId('add-recipe-toggle')));
    expect(await screen.findByTestId(`new-slot-${dinner.id}`)).toBeTruthy();

    const tree = JSON.stringify(screen.toJSON());
    const addOrder = cats.map((c) => tree.indexOf(`"testID":"new-slot-${c.id}"`));
    const cardOrder = cats.map((c) => tree.indexOf(`"testID":"entry-slot-${placed.id}-${c.id}"`));
    expect(addOrder.every((i) => i >= 0)).toBe(true);
    expect([...addOrder].sort((a, b) => a - b)).toEqual(addOrder);
    expect(cardOrder.every((i) => i >= 0)).toBe(true);
    expect([...cardOrder].sort((a, b) => a - b)).toEqual(cardOrder);

    expect(screen.getByTestId(`new-slot-${dinner.id}`).props.accessibilityState).toMatchObject({ selected: true });
    const breakfast = cats.find((c) => c.name === 'Breakfast');
    if (!breakfast) throw new Error('Breakfast category missing');
    expect(screen.getByTestId(`new-slot-${breakfast.id}`).props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.queryByRole('button', { name: 'Snack' })).toBeNull();
    expect(screen.queryByText('Uncategorized')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Get me laid' }).length).toBeGreaterThan(0);

    const label = within(screen.getByTestId(`new-slot-${cats[3].id}`)).getByText('Get me laid');
    expect(label.props.numberOfLines).toBeUndefined();
    expect(label.props.ellipsizeMode).toBeUndefined();
    expect(StyleSheet.flatten(label.props.style).flexShrink).toBe(1);
  });

  it('renders a stored snack as Snack when Snack is not a category', async () => {
    await recipeStore.prepareCategories();
    const recipe = await chicken();
    const today = toIsoDate(new Date());
    await mealPlanStore.addEntry(today, recipe.id, 'snack');
    renderRouter({ index: MealPlan(), 'meal-plan/[date]': DayRoute() }, { initialUrl: '/' });
    expect(await screen.findByText('Snack')).toBeTruthy();
    expect(screen.queryByText('Category removed')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Snack' })).toBeNull();
    expect((await mealPlanStore.entriesForDates([today]))[0].slot).toBe('snack');
  });

  it('renders a deleted category id as Category removed and keeps the stored entry', async () => {
    await recipeStore.prepareCategories();
    const gone = await recipeStore.addCategory('Weeknight');
    const recipe = await chicken();
    const today = toIsoDate(new Date());
    await mealPlanStore.placeEntry({ date: today, recipeId: recipe.id, slot: gone.id });
    await recipeStore.removeCategory(gone.id);
    renderRouter({ index: MealPlan(), 'meal-plan/[date]': DayRoute() }, { initialUrl: '/' });
    expect(await screen.findByText('Category removed')).toBeTruthy();
    expect(screen.queryByText('Weeknight')).toBeNull();
    const stored = await mealPlanStore.entriesForDates([today]);
    expect(stored).toHaveLength(1);
    expect(stored[0].slot).toBe(gone.id);
  });

  it('keeps a new meal off the calendar until Save, and hides the add block', async () => {
    await addSampleRecipes(recipeStore);
    renderRouter({ index: MealPlan(), 'meal-plan/[date]': DayRoute() }, { initialUrl: '/' });
    const today = toIsoDate(new Date());
    expect(await screen.findByText('Nothing planned')).toBeTruthy();
    await act(async () => fireEvent.press(await screen.findByTestId('add-recipe-toggle')));
    await act(async () => fireEvent.press(await screen.findByLabelText('Add Lemon Herb Chicken Thighs')));

    expect(await screen.findByTestId('pending-meal')).toBeTruthy();
    expect(screen.queryByText('Nothing planned')).toBeNull();
    expect(screen.queryByText('Add a recipe')).toBeNull();
    expect(screen.queryByTestId('recipe-search')).toBeNull();
    expect(screen.queryByTestId('new-servings')).toBeNull();
    expect(screen.queryByLabelText('Move Lemon Herb Chicken Thighs to the next day')).toBeNull();
    expect(await mealPlanStore.entriesForDates([today])).toHaveLength(0);

    await act(async () => fireEvent.press(screen.getByLabelText('Increase servings for Lemon Herb Chicken Thighs')));
    expect(screen.getByText('7 servings')).toBeTruthy();
    expect(await mealPlanStore.entriesForDates([today])).toHaveLength(0);

    await act(async () => fireEvent.press(screen.getByTestId('save-planned-meal')));
    const stored = await mealPlanStore.entriesForDates([today]);
    expect(stored).toHaveLength(1);
    expect(stored[0].servings).toBe(7);
    expect(await screen.findByText('Add a recipe')).toBeTruthy();
    expect(screen.queryByTestId('pending-meal')).toBeNull();
    expect(screen.getByLabelText('Move Lemon Herb Chicken Thighs to the next day')).toBeTruthy();
  });

  it('drops the unsaved card when another day is opened and keeps it when the day screen remounts', async () => {
    await addSampleRecipes(recipeStore);
    expect(await recipeStore.list()).toHaveLength(2);
    const today = toIsoDate(new Date());
    const other = addDays(today, 1);
    const expanded = renderRouter({ index: MealPlan(), 'meal-plan/[date]': DayRoute() }, { initialUrl: '/' });
    await act(async () => fireEvent.press(await screen.findByTestId('add-recipe-toggle')));
    expect(await screen.findByText('Lemon Herb Chicken Thighs')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByLabelText('Add Lemon Herb Chicken Thighs')));
    expect(await screen.findByTestId('pending-meal')).toBeTruthy();
    expanded.unmount();

    mockWidth = COMPACT;
    const compact = renderRouter({ index: MealPlan(), 'meal-plan/[date]': DayRoute() }, { initialUrl: `/meal-plan/${today}` });
    expect(await screen.findByTestId('pending-meal')).toBeTruthy();
    expect(await mealPlanStore.entriesForDates([today])).toHaveLength(0);
    compact.unmount();

    mockWidth = EXPANDED;
    renderRouter({ index: MealPlan(), 'meal-plan/[date]': DayRoute() }, { initialUrl: '/' });
    expect(await screen.findByTestId('pending-meal')).toBeTruthy();
    const otherCell = screen.queryByTestId(`day-${other}`) ?? screen.getByTestId('cal-next');
    if (!screen.queryByTestId(`day-${other}`)) fireEvent.press(otherCell);
    await act(async () => fireEvent.press(screen.getByTestId(`day-${other}`)));
    await waitFor(() => expect(screen.queryByTestId('pending-meal')).toBeNull());
    expect(await mealPlanStore.entriesForDates([today, other])).toHaveLength(0);
    expect(screen.getByText('Add a recipe')).toBeTruthy();
  });

  it('ignores Add when that recipe is already planned for the category, including a legacy slot', async () => {
    await recipeStore.prepareCategories();
    const recipe = await chicken();
    const today = toIsoDate(new Date());
    await mealPlanStore.addEntry(today, recipe.id, 'dinner');
    renderRouter({ index: MealPlan(), 'meal-plan/[date]': DayRoute() }, { initialUrl: '/' });
    expect(await screen.findByLabelText(`Remove ${recipe.title}`)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('add-recipe-toggle')));
    await act(async () => fireEvent.press(screen.getByLabelText(`Add ${recipe.title}`)));
    expect(screen.queryByTestId('pending-meal')).toBeNull();
    expect(screen.getByText('Add a recipe')).toBeTruthy();
    expect(await mealPlanStore.entriesForDates([today])).toHaveLength(1);
  });

  it('groups an entry with no slot as Any time', async () => {
    await recipeStore.prepareCategories();
    const recipe = await chicken();
    const today = toIsoDate(new Date());
    await mealPlanStore.addEntry(today, recipe.id);
    renderRouter({ index: MealPlan(), 'meal-plan/[date]': DayRoute() }, { initialUrl: '/' });
    expect(await screen.findByText('Any time')).toBeTruthy();
  });
});

describe.each([
  ['compact', COMPACT],
  ['expanded', EXPANDED],
])('custom meal at %s', (_label, width) => {
  beforeEach(() => {
    mockWidth = width;
  });

  it('starts collapsed, and opening one add section closes the other', async () => {
    await recipeStore.prepareCategories();
    renderRouter({ index: MealPlan(), 'meal-plan/[date]': DayRoute() }, { initialUrl: '/' });
    const today = toIsoDate(new Date());
    if (width < 600) {
      await act(async () => fireEvent.press(await screen.findByTestId(`day-${today}`)));
    }
    expect(await screen.findByText('Nothing planned')).toBeTruthy();
    expect(screen.queryByTestId('recipe-search')).toBeNull();
    expect(screen.queryByTestId('custom-entry-title')).toBeNull();
    expect(screen.getByTestId('add-recipe-toggle').props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.getByTestId('add-custom-toggle').props.accessibilityState).toMatchObject({ expanded: false });

    await act(async () => fireEvent.press(screen.getByTestId('add-recipe-toggle')));
    expect(await screen.findByTestId('recipe-search')).toBeTruthy();
    expect(screen.getByTestId('new-servings')).toBeTruthy();
    expect(screen.queryByTestId('custom-entry-title')).toBeNull();

    await act(async () => fireEvent.press(screen.getByTestId('add-custom-toggle')));
    expect(await screen.findByTestId('custom-entry-title')).toBeTruthy();
    expect(screen.queryByTestId('recipe-search')).toBeNull();
    expect(screen.getByTestId('custom-entry-save').props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => fireEvent.press(screen.getByTestId('custom-entry-save')));
    expect(await mealPlanStore.entriesForDates([today])).toHaveLength(0);
    expect(screen.getByTestId('custom-entry-title')).toBeTruthy();
  });

  it('saves a custom entry without a recipe, shows it on the day and calendar, and removes it', async () => {
    await recipeStore.prepareCategories();
    const lunch = (await recipeStore.listCategories()).find((c) => c.name === 'Lunch');
    if (!lunch) throw new Error('Lunch category missing');
    renderRouter({ index: MealPlan(), 'meal-plan/[date]': DayRoute() }, { initialUrl: '/' });
    const today = toIsoDate(new Date());
    if (width < 600) {
      await act(async () => fireEvent.press(await screen.findByTestId(`day-${today}`)));
    }
    await act(async () => fireEvent.press(await screen.findByTestId('add-custom-toggle')));
    fireEvent.changeText(screen.getByTestId('custom-entry-title'), '  Rotisserie chicken  ');
    await act(async () => fireEvent.press(screen.getByTestId(`custom-slot-${lunch.id}`)));
    await act(async () => fireEvent.press(screen.getByTestId('custom-entry-save')));

    const stored = await mealPlanStore.entriesForDates([today]);
    expect(stored).toHaveLength(1);
    expect(stored[0].title).toBe('Rotisserie chicken');
    expect(stored[0].recipeId).toBeUndefined();
    expect(stored[0].slot).toBe(lunch.id);
    expect(stored[0].servings).toBeUndefined();

    if (width < 600) {
      await waitFor(() => expect(screen).toHavePathname('/'));
      expect(await screen.findByText('Rotisserie chicken')).toBeTruthy();
      await act(async () => fireEvent.press(screen.getByTestId(`day-${today}`)));
    }
    expect(await screen.findByLabelText('Remove Rotisserie chicken')).toBeTruthy();
    expect(screen.queryByText(/servings/i)).toBeNull();
    await act(async () => fireEvent.press(screen.getByLabelText('Remove Rotisserie chicken')));
    await waitFor(() => expect(screen.queryByLabelText('Remove Rotisserie chicken')).toBeNull());
    expect(await mealPlanStore.entriesForDates([today])).toHaveLength(0);
  });
});

describe.each([
  ['compact', COMPACT],
  ['expanded', EXPANDED],
])('shopping list at %s', (_label, width) => {
  beforeEach(() => {
    mockWidth = width;
  });

  it('builds a week, checks items off, adds a manual line, and clears checked', async () => {
    const recipe = await chicken();
    const week = toIsoDate(startOfWeek(new Date()));
    await mealPlanStore.addEntry(week, recipe.id, 'dinner');
    renderRouter({ index: Shopping(), 'grocery-run': Grocery() }, { initialUrl: '/' });
    expect(await screen.findByText('1 meal this week')).toBeTruthy();
    expect(screen.getByTestId(width >= 600 ? 'shopping-layout-dual' : 'shopping-layout-single')).toBeTruthy();
    if (width >= 600) expect(screen.getByTestId('pantry-on-hand')).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByTestId('build-list')));
    expect(await screen.findByText(/green beans/i)).toBeTruthy();
    expect(screen.queryByText(/olive oil/i)).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByRole('checkbox', { name: /green beans/i })));
    expect(await screen.findByTestId('clear-checked')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('manual-input'), '2 lemons');
    await act(async () => fireEvent.press(screen.getByTestId('add-manual')));
    expect(await screen.findByText('2 lemons')).toBeTruthy();
    expect(screen.queryByText('Added by you')).toBeNull();

    await act(async () => fireEvent.press(screen.getByTestId('clear-checked')));
    await waitFor(() => expect(screen.queryByText(/green beans/i)).toBeNull());
    expect(screen.getByText('2 lemons')).toBeTruthy();

    fireEvent.press(screen.getByTestId('week-next'));
    expect(await screen.findByText(`Week of ${formatShortDate(addDays(week, 7))}`)).toBeTruthy();
    expect(screen.getByText('No list yet for this week.')).toBeTruthy();
  });

  it('skips pantry items only when the pantry feature is available', async () => {
    const recipe = await chicken();
    const week = toIsoDate(startOfWeek(new Date()));
    await mealPlanStore.addEntry(week, recipe.id, 'dinner');
    await pantryStore.upsert('olive oil');
    renderRouter({ index: Shopping() }, { initialUrl: '/' });
    await act(async () => fireEvent.press(await screen.findByTestId('build-list')));
    const primary = within(screen.getByTestId('shopping-layout-primary'));
    expect(await primary.findByText(/green beans/i)).toBeTruthy();
    expect(primary.queryByText(/olive oil/i)).toBeNull();
  });

  it('skips nothing and shows no pantry pane when the pantry is hidden in Settings', async () => {
    await settingsStore.update({ features: { pantry: false } });
    const recipe = await chicken();
    const week = toIsoDate(startOfWeek(new Date()));
    await mealPlanStore.addEntry(week, recipe.id, 'dinner');
    await pantryStore.upsert('olive oil');
    renderRouter({ index: Shopping() }, { initialUrl: '/' });
    await act(async () => fireEvent.press(await screen.findByTestId('build-list')));
    expect(await screen.findByText(/green beans/i)).toBeTruthy();
    expect(screen.getByText(/olive oil/i)).toBeTruthy();
    expect(screen.getByTestId('shopping-layout-single')).toBeTruthy();
    expect(screen.queryByTestId('pantry-on-hand')).toBeNull();
    expect(screen.queryByText('Pantry is hidden.')).toBeNull();
  });
});

describe('grocery run (spec #18)', () => {
  it.each([
    ['compact', COMPACT],
    ['expanded', EXPANDED],
  ])('keeps the screen awake, shows one flat list, and checks items off at %s', async (_label, width) => {
    mockWidth = width;
    const recipe = await chicken();
    const week = toIsoDate(startOfWeek(new Date()));
    await mealPlanStore.addEntry(week, recipe.id, 'dinner');
    renderRouter({ index: Grocery(), 'grocery-run': Grocery() }, { initialUrl: `/grocery-run?weekStart=${week}` });
    expect(await screen.findByText(/green beans/i)).toBeTruthy();
    expect(screen.queryByTestId('grocery-aisle-Produce')).toBeNull();
    expect(screen.queryByTestId('grocery-aisle-Meat & seafood')).toBeNull();
    expect(screen.queryByText(/left$/)).toBeNull();
    expect(screen.queryByText('By aisle')).toBeNull();
    expect(screen.queryByTestId('grocery-summary')).toBeNull();
    expect(useKeepAwake).toHaveBeenCalledWith('grocery-run', { suppressDeactivateWarnings: true });
    expect(screen.queryByTestId('grocery-layout-dual')).toBeNull();

    expect(screen.queryByTestId('grocery-undo')).toBeNull();
    expect(screen.queryByText('Undo')).toBeNull();
    const progressText = () => String(screen.getByTestId('grocery-progress').props.children);
    expect(progressText()).toMatch(/^0 of /);
    const beans = () => screen.getByLabelText(/green beans/i);
    await act(async () => fireEvent.press(beans()));
    await waitFor(() => expect(progressText()).toMatch(/^1 of /));
    await act(async () => fireEvent.press(beans()));
    await waitFor(() => expect(progressText()).toMatch(/^0 of /));
  });

  it('builds a run from one recipe', async () => {
    mockWidth = EXPANDED;
    const recipe = await chicken();
    renderRouter({ 'grocery-run': Grocery() }, { initialUrl: `/grocery-run?recipeId=${recipe.id}` });
    expect(await screen.findByText(/green beans/i)).toBeTruthy();
    expect(screen.queryByTestId('grocery-undo')).toBeNull();
    expect(screen.queryByTestId('grocery-layout-dual')).toBeNull();
    expect(screen.queryByText('By aisle')).toBeNull();
  });

  it('opens notes without checking the item off; only the checkbox toggles', () => {
    const onToggle = jest.fn();
    const item = {
      id: '1',
      weekStart: '2026-10-05' as const,
      text: "Peanut M&M's",
      checked: false,
      recipeIds: [],
      quantity: '1',
      notes: 'Party size',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    render(<GroceryRunView items={[item]} onToggle={onToggle} />);
    expect(screen.getByText('Qty: 1')).toBeTruthy();
    expect(screen.queryByText('Party size')).toBeNull();
    fireEvent.press(screen.getByText('(see notes)'));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByText('Party size')).toBeTruthy();
    fireEvent.press(screen.getAllByText("Peanut M&M's")[0]);
    fireEvent.press(screen.getByText('Qty: 1'));
    expect(onToggle).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('grocery-check-1'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shopping list opens notes without checking the item off; only the checkbox toggles', () => {
    const onToggle = jest.fn();
    const item = {
      id: 's1',
      weekStart: '2026-10-05' as const,
      text: 'Paper towels',
      checked: false,
      recipeIds: [] as string[],
      quantity: '2',
      notes: 'Big pack',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    render(
      <ShoppingListView
        weekStart="2026-10-05"
        mealCount={1}
        list={{
          id: 'list',
          weekStart: '2026-10-05',
          items: [item],
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }}
        manualText=""
        onManualText={() => undefined}
        manualQuantity=""
        onManualQuantity={() => undefined}
        manualNotes=""
        onManualNotes={() => undefined}
        onEditItem={() => undefined}
        showGroceryRun
        onPrevWeek={() => undefined}
        onNextWeek={() => undefined}
        onBuild={() => undefined}
        onToggle={onToggle}
        onAddManual={() => undefined}
        onClearChecked={() => undefined}
        onGroceryRun={() => undefined}
      />,
    );
    expect(screen.getByTestId('shopping-list').props.keyboardShouldPersistTaps).toBe('handled');
    expect(screen.getByText('Qty: 2')).toBeTruthy();
    expect(screen.queryByText('Big pack')).toBeNull();
    fireEvent.press(screen.getByText('(see notes)'));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByTestId('grocery-notes-modal')).toBeTruthy();
    expect(screen.getByText('Big pack')).toBeTruthy();
    fireEvent.press(screen.getAllByText('Paper towels')[0]);
    fireEvent.press(screen.getByText('Qty: 2'));
    expect(onToggle).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('shop-item-s1'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('gates (spec #11, #12, #18)', () => {
  it('v1.0.5: the grocery-run button reads “View Shopping List” on the Shopping screen and recipe detail', async () => {
    const recipe = await chicken();
    const shop = renderRouter({ index: Shopping() }, { initialUrl: '/' });
    const button = await screen.findByTestId('grocery-run-button');
    expect(within(button).getByText('View Shopping List')).toBeTruthy();
    expect(screen.getByTestId('build-list')).toHaveTextContent('Build from Meal Plan');
    expect(screen.queryByText(/this week’s plan/)).toBeNull();
    expect(screen.queryByText(/grocery run/i)).toBeNull();
    shop.unmount();

    renderRouter({ 'recipe/[id]': Recipe() }, { initialUrl: `/recipe/${recipe.id}` });
    const detailButton = await screen.findByTestId('grocery-run-button');
    expect(within(detailButton).getByText('View Shopping List')).toBeTruthy();
    expect(screen.queryByText(/grocery run/i)).toBeNull();
  });

  it('a locked meal plan and a locked grocery run stay quiet', async () => {
    featureGate.setProvider(new NoEntitlements());
    featureGate.setConfig({
      mealPlan: { tier: 'premium', enabled: true },
      groceryRun: { tier: 'premium', enabled: true },
    });
    const recipe = await chicken();
    const locked = renderRouter({ index: MealPlan() }, { initialUrl: '/' });
    expect(await screen.findByTestId('feature-locked-mealPlan')).toBeTruthy();
    expect(screen.queryByText(/buy|upgrade|subscribe|purchase/i)).toBeNull();
    locked.unmount();

    renderRouter({ 'recipe/[id]': Recipe() }, { initialUrl: `/recipe/${recipe.id}` });
    expect(await screen.findByTestId('recipe-detail')).toBeTruthy();
    expect(screen.queryByTestId('grocery-run-button')).toBeNull();
    expect(screen.queryByTestId('plan-today-button')).toBeNull();
  });

  it('hides grocery run when shopping is turned off, without blocking the recipe', async () => {
    await settingsStore.update({ features: { mealPlan: true, shopping: false, pantry: true } });
    const recipe = await chicken();
    renderRouter({ 'recipe/[id]': Recipe() }, { initialUrl: `/recipe/${recipe.id}` });
    expect(await screen.findByTestId('recipe-detail')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('grocery-run-button')).toBeNull());
    expect(screen.getByTestId('plan-today-button')).toBeTruthy();
  });

  it('does not skip pantry items when pantry is locked', async () => {
    const recipe = await chicken();
    const week = toIsoDate(startOfWeek(new Date()));
    await mealPlanStore.addEntry(week, recipe.id, 'dinner');
    await pantryStore.upsert('olive oil');
    featureGate.setProvider(new NoEntitlements());
    featureGate.setConfig({ pantry: { tier: 'premium', enabled: true } });
    renderRouter({ index: Shopping() }, { initialUrl: '/' });
    await act(async () => fireEvent.press(await screen.findByTestId('build-list')));
    expect(await screen.findByText(/olive oil/i)).toBeTruthy();
  });
});
