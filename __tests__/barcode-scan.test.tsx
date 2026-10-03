import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { barcodeLookup } from '@/pantry';
import { pantryStore } from '@/storage/pantry';

const EAN = '3017620422003';

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
  it('adds a found product (name as the title) and returns to the pantry; a re-scan increments it', async () => {
    jest.spyOn(barcodeLookup, 'lookup').mockResolvedValue({
      status: 'found',
      source: 'openfoodfacts',
      product: { barcode: EAN, name: 'Almond Flour', brand: 'Bob’s' },
    });
    renderScan();
    expect(await screen.findByTestId('barcode-camera')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('mock-scan')));
    expect(await screen.findByTestId('pantry-added-banner')).toHaveTextContent('Added Almond Flour');
    expect(screen).toHavePathname('/pantry');
    // Product name is the item title, brand secondary.
    expect(screen.getByText('Almond Flour')).toBeTruthy();
    expect(screen.getByText(/1 package · Bob’s/)).toBeTruthy();

    const { router } = require('expo-router');
    await act(async () => router.push('/pantry/scan'));
    await act(async () => fireEvent.press(await screen.findByTestId('mock-scan')));
    await screen.findByTestId('pantry-added-banner');
    const items = await pantryStore.list();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Almond Flour', brand: 'Bob’s', barcode: EAN, quantity: 2 });
  });

  it('asks for a name once when the barcode is unknown, saves the mapping, and returns to the pantry', async () => {
    jest.spyOn(barcodeLookup, 'lookup').mockResolvedValue({ status: 'not_found', barcode: EAN });
    const save = jest.spyOn(barcodeLookup, 'saveUserProduct').mockResolvedValue({ barcode: EAN, name: 'Chicken breast' });
    renderScan();
    await screen.findByTestId('mock-scan');
    await act(async () => fireEvent.press(screen.getByTestId('mock-scan')));
    expect(await screen.findByText(/No product found/)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('barcode-name-input'), 'Chicken breast');
    await act(async () => fireEvent.press(screen.getByTestId('barcode-save-button')));
    expect(await screen.findByText('Added Chicken breast')).toBeTruthy();
    expect(save).toHaveBeenCalledWith(EAN, 'Chicken breast');
    expect(await pantryStore.list()).toEqual([
      expect.objectContaining({ name: 'Chicken breast', barcode: EAN, quantity: 1 }),
    ]);
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
