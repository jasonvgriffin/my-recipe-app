import { act, fireEvent, screen } from '@testing-library/react-native';
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

    expect(await screen.findByText('chicken breast')).toBeTruthy();
    expect(screen.getByText(/2 lb · Perdue · Meat/)).toBeTruthy();
    expect(screen.getByText(/Expired 2020-01-01/)).toBeTruthy();

    fireEvent.press(screen.getByTestId(/^pantry-item-/));
    expect(screen.getByTestId('pantry-brand-input').props.value).toBe('Perdue');
    fireEvent.changeText(screen.getByTestId('pantry-quantity-input'), '4');
    await act(async () => fireEvent.press(screen.getByTestId('pantry-save-button')));
    expect(await screen.findByText(/4 lb · Perdue · Meat/)).toBeTruthy();

    fireEvent.press(screen.getByTestId(/^pantry-item-/));
    await act(async () => fireEvent.press(screen.getByTestId('pantry-remove-button')));
    expect(await screen.findByText('Nothing in the pantry yet.')).toBeTruthy();
  });

  it('ranks seeded recipes by what is on hand', async () => {
    renderPantry();
    await screen.findByText('Nothing in the pantry yet.');
    fireEvent.press(screen.getByTestId('pantry-add-button'));
    fireEvent.changeText(screen.getByTestId('pantry-name-input'), 'olive oil');
    await act(async () => fireEvent.press(screen.getByTestId('pantry-save-button')));
    await screen.findByText('olive oil');

    fireEvent.press(screen.getByTestId('pantry-show-ideas'));
    expect(await screen.findByText('Lemon Herb Chicken Thighs')).toBeTruthy();
    expect(screen.getByText(/of \d+ on hand/)).toBeTruthy();
    expect(screen.queryByText('Allulose Vanilla Cheesecake Mousse')).toBeNull();
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

describe('pantry list filter and sort (spec #21)', () => {
  it('filters by category and sorts expiring items first', async () => {
    const { pantryStore } = require('@/storage/pantry') as typeof import('@/storage/pantry');
    await pantryStore.saveDetails({ name: 'Yogurt', category: 'Dairy', expiresAt: '2030-01-09' });
    await pantryStore.saveDetails({ name: 'Apples', category: 'Produce', expiresAt: '2030-01-02' });
    await pantryStore.saveDetails({ name: 'Cheese', category: 'Dairy' });
    renderPantry();
    expect(await screen.findByText('yogurt')).toBeTruthy();
    fireEvent.press(screen.getByTestId('pantry-filter-Dairy'));
    expect(screen.queryByText('apples')).toBeNull();
    expect(screen.getByText('cheese')).toBeTruthy();
    fireEvent.press(screen.getByTestId('pantry-filter-all'));
    fireEvent.press(screen.getByTestId('pantry-sort'));
    expect(screen.getByText('Sort: expiring first')).toBeTruthy();
    const names = screen.getAllByText(/^(apples|yogurt|cheese)$/).map((el) => el.props.children);
    expect(names).toEqual(['apples', 'yogurt', 'cheese']);
  });
});

