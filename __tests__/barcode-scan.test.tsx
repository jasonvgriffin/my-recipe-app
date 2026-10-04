import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { barcodeLookup } from '@/pantry';
import { pantryStore } from '@/storage/pantry';

const EAN = '3017620422003';

/** testIDs in paint order. FlatList's test tree has circular refs, so JSON.stringify(screen.toJSON()) throws. */
function testIdsInOrder(node: unknown, seen = new WeakSet<object>(), out: string[] = []): string[] {
  if (node == null || typeof node !== 'object') return out;
  if (seen.has(node)) return out;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const child of node) testIdsInOrder(child, seen, out);
    return out;
  }
  const el = node as { children?: unknown; props?: { testID?: unknown } };
  if (typeof el.props?.testID === 'string') out.push(el.props.testID);
  return testIdsInOrder(el.children, seen, out);
}

jest.mock('expo-camera', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    CameraView: ({ onBarcodeScanned }: { onBarcodeScanned?: (event: { data: string }) => void }) =>
      React.createElement(
        View,
        { testID: 'barcode-camera' },
        React.createElement(
          Pressable,
          {
            testID: 'mock-scan',
            onPress: () => onBarcodeScanned?.({ data: EAN }),
          },
          React.createElement(Text, null, 'scan'),
        ),
      ),
    useCameraPermissions: () => {
      const cam = (globalThis as { __cam?: { granted: boolean; canAskAgain: boolean; status: string } }).__cam ?? {
        granted: true,
        canAskAgain: true,
        status: 'granted',
      };
      return [cam, jest.fn(async () => cam), jest.fn()];
    },
  };
});

beforeEach(async () => {
  (globalThis as { __cam?: { granted: boolean; canAskAgain: boolean; status: string } }).__cam = {
    granted: true,
    canAskAgain: true,
    status: 'granted',
  };
  await require('@react-native-async-storage/async-storage').clear();
  jest.restoreAllMocks();
});

const routes = () => ({
  _layout: require('@/app/_layout').default,
  '(tabs)/_layout': require('@/app/(tabs)/_layout').default,
  '(tabs)/index': require('@/app/(tabs)/index').default,
  '(tabs)/pantry': require('@/app/(tabs)/pantry').default,
  '(tabs)/more': require('@/app/(tabs)/more').default,
  '(tabs)/add-menu': require('@/app/(tabs)/add-menu').default,
  '(tabs)/shopping': require('@/app/(tabs)/shopping').default,
  'pantry/scan': require('@/app/pantry/scan').default,
  'shopping/scan': require('@/app/shopping/scan').default,
});

beforeAll(() => {
  routes();
}, 60_000);

function renderScan(url = '/pantry/scan') {
  renderRouter(routes(), { initialUrl: url });
}

describe('barcode camera (spec #27)', () => {
  it('v1.0.7: a found product opens the pre-filled Edit item form for review; Save adds it; a re-scan opens it with +1', async () => {
    jest.spyOn(barcodeLookup, 'lookup').mockResolvedValue({
      status: 'found',
      source: 'openfoodfacts',
      product: { barcode: EAN, name: 'Almond Flour', brand: 'Bob’s' },
    });
    renderScan();
    expect(await screen.findByTestId('barcode-camera')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('mock-scan')));
    expect(await screen.findByTestId('pantry-scan-review')).toBeTruthy();
    expect(screen).toHavePathname('/pantry');
    expect(screen.getByTestId('pantry-form-heading')).toHaveTextContent('Edit item');
    expect(screen.getByTestId('pantry-name-input').props.value).toBe('Almond Flour');
    expect(screen.getByTestId('pantry-brand-input').props.value).toBe('Bob’s');
    expect(screen.getByTestId('pantry-quantity-input').props.value).toBe('1');
    expect(screen.getByTestId('pantry-notes-input').props.value).toBe('');
    // Nothing is saved until the user reviews and taps Save.
    expect(await pantryStore.list()).toHaveLength(0);
    fireEvent.changeText(screen.getByTestId('pantry-notes-input'), 'Top shelf');
    await act(async () => fireEvent.press(screen.getByTestId('pantry-save-button')));
    expect(await screen.findByTestId('pantry-added-banner')).toHaveTextContent('Added Almond Flour');
    // Product name is the item title, brand secondary.
    expect(screen.getByText('Almond Flour')).toBeTruthy();
    expect(screen.getByText(/1 package · Bob’s/)).toBeTruthy();
    expect(screen.getByText('Top shelf')).toBeTruthy();

    const { router } = require('expo-router');
    await act(async () => router.push('/pantry/scan'));
    await act(async () => fireEvent.press(await screen.findByTestId('mock-scan')));
    await screen.findByTestId('pantry-scan-review');
    expect(screen.getByTestId('pantry-quantity-input').props.value).toBe('2');
    expect(screen.getByTestId('pantry-notes-input').props.value).toBe('Top shelf');
    await act(async () => fireEvent.press(screen.getByTestId('pantry-save-button')));
    await screen.findByTestId('pantry-added-banner');
    const items = await pantryStore.list();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Almond Flour', brand: 'Bob’s', barcode: EAN, quantity: 2, notes: 'Top shelf' });
  });

  it('asks for a name once when the barcode is unknown, saves the mapping, then opens the form for review', async () => {
    jest.spyOn(barcodeLookup, 'lookup').mockResolvedValue({ status: 'not_found', barcode: EAN });
    const save = jest.spyOn(barcodeLookup, 'saveUserProduct').mockResolvedValue({ barcode: EAN, name: 'Chicken breast' });
    renderScan();
    await screen.findByTestId('mock-scan');
    await act(async () => fireEvent.press(screen.getByTestId('mock-scan')));
    expect(await screen.findByText(/No product found/)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('barcode-name-input'), 'Chicken breast');
    await act(async () => fireEvent.press(screen.getByTestId('barcode-save-button')));
    expect(save).toHaveBeenCalledWith(EAN, 'Chicken breast');
    expect(await screen.findByTestId('pantry-scan-review')).toBeTruthy();
    expect(screen.getByTestId('pantry-name-input').props.value).toBe('Chicken breast');
    await act(async () => fireEvent.press(screen.getByTestId('pantry-save-button')));
    expect(await screen.findByText('Added Chicken breast')).toBeTruthy();
    expect(await pantryStore.list()).toEqual([
      expect.objectContaining({ name: 'Chicken breast', barcode: EAN, quantity: 1 }),
    ]);
  });

  it('shopping list (v1.0.5): the Add an item row first, then “or”, then Scan Item, Build from Meal Plan, View Shopping List', async () => {
    renderScan('/shopping');
    const scan = await screen.findByTestId('shopping-scan-button');
    expect(scan).toHaveTextContent('Scan Item');
    expect(screen.getByTestId('shopping-scan-or')).toHaveTextContent('or');
    expect(screen.getByTestId('manual-input').props.placeholder).toBe('Type here & press Add');
    expect(screen.getByTestId('build-list')).toHaveTextContent('Build from Meal Plan');
    expect(screen.getByTestId('grocery-run-button')).toHaveTextContent('View Shopping List');
    const { StyleSheet } = require('react-native');
    const actions = StyleSheet.flatten(screen.getByTestId('shopping-actions').props.style);
    expect(actions.width).toBe('78%');
    expect(actions.alignSelf).toBe('center');
    expect(actions.maxWidth).toBe(420);
    expect(actions.gap).toBeGreaterThanOrEqual(12);
    const tree = testIdsInOrder(screen.toJSON());
    const order = [
      'week-label',
      'manual-input',
      'add-manual',
      'shopping-scan-or',
      'shopping-scan-button',
      'build-list',
      'grocery-run-button',
    ].map((id) => tree.indexOf(id));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('shopping list: scan adds the product name as a line and returns to the list', async () => {
    jest.spyOn(barcodeLookup, 'lookup').mockResolvedValue({
      status: 'found',
      source: 'cache',
      product: { barcode: EAN, name: 'Nutella Hazelnut Spread', brand: 'Ferrero' },
    });
    const { startOfWeek, toIsoDate } = require('@/lib/dates');
    const week = toIsoDate(startOfWeek(new Date()));
    renderScan('/shopping');
    await act(async () => fireEvent.press(await screen.findByTestId('shopping-scan-button')));
    await act(async () => fireEvent.press(await screen.findByTestId('mock-scan')));
    expect(await screen.findByTestId('shopping-added-banner')).toHaveTextContent('Added Nutella Hazelnut Spread');
    expect(screen).toHavePathname('/shopping');
    expect(await screen.findByText('Nutella Hazelnut Spread')).toBeTruthy();
    const { mealPlanStore } = require('@/storage/meal-plan');
    const list = await mealPlanStore.getShoppingList(week);
    expect(list.items.map((i: { text: string }) => i.text)).toEqual(['Nutella Hazelnut Spread']);
    expect(await pantryStore.list()).toEqual([]); // the pantry is untouched
  });

  it('explains camera permission when it has not been granted', async () => {
    (globalThis as { __cam?: { granted: boolean; canAskAgain: boolean; status: string } }).__cam = {
      granted: false,
      canAskAgain: true,
      status: 'denied',
    };
    renderScan();
    expect(await screen.findByTestId('barcode-permission')).toBeTruthy();
    expect(screen.getByText(/Camera access is needed/)).toBeTruthy();
    expect(screen.queryByTestId('barcode-camera')).toBeNull();
  });
});
