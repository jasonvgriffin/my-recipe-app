import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { featureGate, LocalFreeEntitlements, NoEntitlements } from '@/entitlements';
import { settingsStore } from '@/storage/settings';

let mockWidth = 411;
jest.mock('@/hooks/use-window-size-class', () => {
  const actual = jest.requireActual('@/hooks/use-window-size-class');
  return { ...actual, useWindowSizeClass: () => actual.getWindowLayout(mockWidth, 800) };
});

beforeEach(async () => {
  mockWidth = 411;
  await require('@react-native-async-storage/async-storage').clear();
  featureGate.resetConfig();
  featureGate.setProvider(new LocalFreeEntitlements());
});

function renderPantry() {
  const Pantry = require('@/app/(tabs)/pantry').default;
  const Recipe = require('@/app/recipe/[id]').default;
  renderRouter({ index: Pantry, 'recipe/[id]': Recipe }, { initialUrl: '/' });
}

describe('pantry screen (spec #21)', () => {
  it('adds, edits, and removes an item with quantity, unit, brand, category, and expiry', async () => {
    renderPantry();
    expect(await screen.findByText('Nothing in the pantry yet.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('pantry-add-button'));
    fireEvent.changeText(screen.getByTestId('pantry-name-input'), 'Chicken breast');
    fireEvent.changeText(screen.getByTestId('pantry-quantity-input'), '2');
    fireEvent.changeText(screen.getByTestId('pantry-unit-input'), 'lb');
    fireEvent.changeText(screen.getByTestId('pantry-brand-input'), 'Perdue');
    fireEvent.press(screen.getByText('Meat'));
    fireEvent.changeText(screen.getByTestId('pantry-expiry-input'), '2020-01-01');
    await act(async () => fireEvent.press(screen.getByTestId('pantry-save-button')));

    const row = await screen.findByTestId(/^pantry-item-/);
    expect(within(row).getByText('Chicken breast')).toBeTruthy();
    expect(within(row).getByText('Quantity: 2')).toBeTruthy();
    expect(within(row).queryByText('Meat')).toBeNull();
    expect(within(row).queryByText(/Perdue/)).toBeNull();
    expect(within(row).queryByText(/lb/)).toBeNull();
    expect(within(row).queryByText(/Expired/)).toBeNull();
    expect(screen.getByTestId('pantry-filter-Meat')).toBeTruthy();

    fireEvent.press(row);
    expect(screen.getByTestId('pantry-brand-input').props.value).toBe('Perdue');
    expect(screen.getByTestId('pantry-category-input').props.value).toBe('Meat');
    fireEvent.changeText(screen.getByTestId('pantry-quantity-input'), '4');
    await act(async () => fireEvent.press(screen.getByTestId('pantry-save-button')));
    expect(await screen.findByText('Quantity: 4')).toBeTruthy();
    expect(screen.queryByText('Quantity: 2')).toBeNull();

    fireEvent.press(screen.getByTestId(/^pantry-item-/));
    await act(async () => fireEvent.press(screen.getByTestId('pantry-remove-button')));
    expect(await screen.findByText('Nothing in the pantry yet.')).toBeTruthy();
  });

  it('has no "What can I cook" section any more (it moved to the Recipes tab)', async () => {
    renderPantry();
    await screen.findByText('Nothing in the pantry yet.');
    expect(screen.queryByText(/What can I cook/)).toBeNull();
    expect(screen.queryByTestId('pantry-suggestions')).toBeNull();
    expect(screen.queryByTestId('scan-receipt-button')).toBeNull();
  });

  it('has no barcode scan button', async () => {
    renderPantry();
    await screen.findByText('Nothing in the pantry yet.');
    expect(screen.queryByTestId('scan-barcode-button')).toBeNull();
    expect(screen.queryByText('Scan barcode')).toBeNull();
  });

  it('stays quiet when the user hides pantry', async () => {
    await settingsStore.update({ features: { mealPlan: true, shopping: true, pantry: false } });
    renderPantry();
    expect(await screen.findByTestId('pantry-hidden')).toBeTruthy();
    expect(screen.queryByTestId('pantry-add-button')).toBeNull();
  });

  it('locks the screen when pantry is premium and there is no entitlement', async () => {
    featureGate.setProvider(new NoEntitlements());
    featureGate.setConfig({ pantry: { tier: 'premium', enabled: true } });
    renderPantry();
    expect(await screen.findByTestId('feature-locked-pantry')).toBeTruthy();
    expect(screen.queryByText(/buy|upgrade|subscribe|purchase/i)).toBeNull();
  });
});

describe('pantry row quantity (R10)', () => {
  it('shows Quantity: N beside the name and leaves category, brand, expiry, and notes off the row', async () => {
    const { pantryStore } = require('@/storage/pantry') as typeof import('@/storage/pantry');
    const { StyleSheet } = require('react-native') as typeof import('react-native');
    const candy = await pantryStore.saveDetails({
      name: "M&M's",
      quantity: 2,
      unit: 'bag',
      category: 'Snacks',
      brand: 'Mars',
      expiresAt: '2020-01-01',
      notes: 'Top shelf',
    });
    const oil = await pantryStore.saveDetails({ name: 'Olive oil', category: 'Pantry' });
    const salt = await pantryStore.saveDetails({ name: 'Salt', quantity: 0, unit: 'tsp', category: 'Spices' });
    renderPantry();

    const candyRow = await screen.findByTestId(`pantry-item-${candy.id}`);
    const name = within(candyRow).getByText("M&M's");
    const quantity = within(candyRow).getByText('Quantity: 2');
    expect(within(candyRow).queryByText('Snacks')).toBeNull();
    expect(within(candyRow).queryByText(/Mars/)).toBeNull();
    expect(within(candyRow).queryByText(/bag/)).toBeNull();
    expect(within(candyRow).queryByText(/Expired/)).toBeNull();
    expect(within(candyRow).queryByText('Top shelf')).toBeNull();
    expect(StyleSheet.flatten(name.props.style)).toEqual(expect.objectContaining({ flexShrink: 1, minWidth: 0 }));
    expect(StyleSheet.flatten(quantity.props.style)).toEqual(expect.objectContaining({ flexShrink: 0 }));
    expect(quantity.props.numberOfLines).toBeUndefined();
    expect(quantity.props.ellipsizeMode).toBeUndefined();

    const oilRow = screen.getByTestId(`pantry-item-${oil.id}`);
    expect(within(oilRow).getByText('Olive oil')).toBeTruthy();
    expect(within(oilRow).queryByText(/Quantity/)).toBeNull();
    expect(within(oilRow).queryByText('Pantry')).toBeNull();

    const saltRow = screen.getByTestId(`pantry-item-${salt.id}`);
    expect(within(saltRow).getByText('Quantity: 0')).toBeTruthy();
    expect(within(saltRow).queryByText('Spices')).toBeNull();
    expect(within(saltRow).queryByText(/tsp/)).toBeNull();
  });

  it('opens the editor from the row and keeps a category saved there', async () => {
    const { pantryStore } = require('@/storage/pantry') as typeof import('@/storage/pantry');
    const rice = await pantryStore.saveDetails({ name: 'Rice', quantity: 1 });
    renderPantry();
    fireEvent.press(await screen.findByTestId(`pantry-item-${rice.id}`));
    expect(screen.getByText('Edit item')).toBeTruthy();
    expect(screen.getByTestId('pantry-category-input').props.value).toBe('');
    fireEvent.changeText(screen.getByTestId('pantry-category-input'), 'Grains');
    await act(async () => fireEvent.press(screen.getByTestId('pantry-save-button')));

    const row = await screen.findByTestId(`pantry-item-${rice.id}`);
    expect(within(row).getByText('Quantity: 1')).toBeTruthy();
    expect(within(row).queryByText('Grains')).toBeNull();
    fireEvent.press(row);
    expect(screen.getByTestId('pantry-category-input').props.value).toBe('Grains');
    expect((await pantryStore.list())[0].category).toBe('Grains');
  });
});

describe('pantry list filter and sort (spec #21)', () => {
  it('filters by category and sorts expiring items first', async () => {
    const { pantryStore } = require('@/storage/pantry') as typeof import('@/storage/pantry');
    await pantryStore.saveDetails({ name: 'Yogurt', category: 'Dairy', expiresAt: '2030-01-09' });
    await pantryStore.saveDetails({ name: 'Apples', category: 'Produce', expiresAt: '2030-01-02' });
    await pantryStore.saveDetails({ name: 'Cheese', category: 'Dairy' });
    renderPantry();
    expect(await screen.findByText('Yogurt')).toBeTruthy();
    fireEvent.press(screen.getByTestId('pantry-filter-Dairy'));
    expect(screen.queryByText('Apples')).toBeNull();
    expect(screen.getByText('Cheese')).toBeTruthy();
    fireEvent.press(screen.getByTestId('pantry-filter-all'));
    fireEvent.press(screen.getByTestId('pantry-sort'));
    expect(screen.getByText('Sort: expiring first')).toBeTruthy();
    const names = screen.getAllByText(/^(Apples|Yogurt|Cheese)$/).map((el) => el.props.children);
    expect(names).toEqual(['Apples', 'Yogurt', 'Cheese']);
  });
});

describe('What can I make with my existing pantry? (Recipes tab button)', () => {
  function renderMatch() {
    const Match = require('@/app/pantry-match').default;
    const Recipe = require('@/app/recipe/[id]').default;
    renderRouter({ index: Match, 'recipe/[id]': Recipe }, { initialUrl: '/' });
  }

  it('ranks recipes by what is on hand', async () => {
    const { recipeStore } = require('@/storage/recipes') as typeof import('@/storage/recipes');
    const { pantryStore } = require('@/storage/pantry') as typeof import('@/storage/pantry');
    const { addSampleRecipes } = require('../test-helpers/sample-recipes');
    await addSampleRecipes(recipeStore);
    await pantryStore.saveDetails({ name: 'olive oil' });
    renderMatch();
    expect(await screen.findByText('Lemon Herb Chicken Thighs')).toBeTruthy();
    expect(screen.getByText(/of \d+ on hand/)).toBeTruthy();
    expect(screen.queryByText(/Cheesecake Mousse/)).toBeNull();
  });

  it('explains gently when the pantry is empty', async () => {
    renderMatch();
    expect(await screen.findByTestId('pantry-match-empty')).toBeTruthy();
  });

  it('explains gently when the pantry is hidden in Settings', async () => {
    await settingsStore.update({ features: { mealPlan: true, shopping: true, pantry: false } });
    renderMatch();
    expect(await screen.findByTestId('pantry-match-off')).toBeTruthy();
  });
});
