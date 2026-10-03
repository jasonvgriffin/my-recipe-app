/**
 * Meal plan, shopping list, and grocery run (spec #11, #12, #18, #23).
 * Each screen is exercised at compact (411dp) and expanded (900dp).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useKeepAwake } from 'expo-keep-awake';

import { featureGate, LocalFreeEntitlements, NoEntitlements } from '@/entitlements';
import { addDays, formatMonthYear, formatShortDate, startOfWeek, toIsoDate } from '@/lib/dates';
import { mealPlanStore } from '@/storage/meal-plan';
import { pantryStore } from '@/storage/pantry';
import { recipeStore } from '@/storage/recipes';
import { settingsStore } from '@/storage/settings';

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
  await recipeStore.seedIfNeeded();
  const list = await recipeStore.list();
  const found = list.find((r) => r.title.includes('Chicken'));
  if (!found) throw new Error('seed chicken missing');
  return found;
}

beforeEach(async () => {
  mockWidth = COMPACT;
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
    renderRouter({ index: MealPlan(), 'meal-plan/[date]': DayRoute() }, { initialUrl: '/' });
    expect(await screen.findByTestId(width >= 600 ? 'meal-plan-layout-dual' : 'meal-plan-layout-single')).toBeTruthy();

    const today = toIsoDate(new Date());
    if (width < 600) {
      expect(screen.queryByTestId('day-plan')).toBeNull();
      await act(async () => fireEvent.press(screen.getByTestId(`day-${today}`)));
      expect(screen).toHavePathname(`/meal-plan/${today}`);
    }
    expect(await screen.findByText('Nothing planned')).toBeTruthy();
    await act(async () => fireEvent.press(await screen.findByLabelText('Add Lemon Herb Chicken Thighs')));
    expect(await screen.findByLabelText('Remove Lemon Herb Chicken Thighs')).toBeTruthy();
    expect(screen.getByText('6 servings')).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByLabelText('Increase servings for Lemon Herb Chicken Thighs')));
    expect(await screen.findByText('7 servings')).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByLabelText('Set Lemon Herb Chicken Thighs to Lunch')));
    expect(screen.getAllByText('Lunch').length).toBeGreaterThan(0);

    await act(async () => fireEvent.press(screen.getByLabelText('Move Lemon Herb Chicken Thighs to the next day')));
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

  it('switches between week and month', async () => {
    renderRouter({ index: MealPlan() }, { initialUrl: '/' });
    expect(await screen.findByTestId('view-week')).toBeTruthy();
    const now = new Date();
    fireEvent.press(screen.getByTestId('view-month'));
    expect(await screen.findByText(formatMonthYear(now.getFullYear(), now.getMonth()))).toBeTruthy();
    fireEvent.press(screen.getByTestId('cal-next'));
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    expect(await screen.findByText(formatMonthYear(nextMonth.getFullYear(), nextMonth.getMonth()))).toBeTruthy();
    fireEvent.press(screen.getByTestId('view-week'));
    expect(await screen.findByText(`Week of ${formatShortDate(toIsoDate(startOfWeek(nextMonth)))}`)).toBeTruthy();
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
    const beans = await screen.findByText(/green beans/i);
    expect(screen.queryByText(/olive oil/i)).toBeTruthy();

    await act(async () => fireEvent.press(beans));
    expect(await screen.findByTestId('clear-checked')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('manual-input'), '2 lemons');
    await act(async () => fireEvent.press(screen.getByTestId('add-manual')));
    expect(await screen.findByText('2 lemons')).toBeTruthy();
    expect(screen.getByText('Added by you')).toBeTruthy();

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
  ])('keeps the screen awake, groups by aisle, and undoes a check at %s', async (_label, width) => {
    mockWidth = width;
    const recipe = await chicken();
    const week = toIsoDate(startOfWeek(new Date()));
    await mealPlanStore.addEntry(week, recipe.id, 'dinner');
    renderRouter({ index: Grocery(), 'grocery-run': Grocery() }, { initialUrl: `/grocery-run?weekStart=${week}` });
    expect(await screen.findByText(/green beans/i)).toBeTruthy();
    expect(screen.getByTestId('grocery-aisle-Produce')).toBeTruthy();
    expect(screen.getByTestId('grocery-aisle-Meat & seafood')).toBeTruthy();
    expect(useKeepAwake).toHaveBeenCalledWith('grocery-run', { suppressDeactivateWarnings: true });
    expect(screen.getByTestId(width >= 600 ? 'grocery-layout-dual' : 'grocery-layout-single')).toBeTruthy();
    if (width >= 600) expect(screen.getByTestId('grocery-summary')).toBeTruthy();

    const progressText = () => String(screen.getByTestId('grocery-progress').props.children);
    expect(progressText()).toMatch(/^0 of /);
    await act(async () => fireEvent.press(screen.getByLabelText(/green beans/i)));
    await waitFor(() => expect(progressText()).toMatch(/^1 of /));
    await act(async () => fireEvent.press(screen.getByTestId('grocery-undo')));
    await waitFor(() => expect(progressText()).toMatch(/^0 of /));
  });

  it('builds a run from one recipe', async () => {
    mockWidth = EXPANDED;
    const recipe = await chicken();
    renderRouter({ 'grocery-run': Grocery() }, { initialUrl: `/grocery-run?recipeId=${recipe.id}` });
    expect(await screen.findByText(/green beans/i)).toBeTruthy();
    expect(screen.getByTestId('grocery-layout-dual')).toBeTruthy();
  });
});

describe('gates (spec #11, #12, #18)', () => {
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
