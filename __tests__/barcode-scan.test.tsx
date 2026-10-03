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

function renderScan() {
  const Scan = require('@/app/pantry/scan').default;
  renderRouter({ index: Scan }, { initialUrl: '/' });
}

describe('barcode camera (spec #27)', () => {
  it('adds a found product and increments it on a second scan', async () => {
    jest.spyOn(barcodeLookup, 'lookup').mockResolvedValue({
      status: 'found',
      source: 'openfoodfacts',
      product: { barcode: EAN, name: 'Almond flour' },
    });
    renderScan();
    expect(await screen.findByTestId('barcode-camera')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('mock-scan')));
    expect(await screen.findByTestId('barcode-added')).toHaveTextContent('Added almond flour. You now have 1.');

    fireEvent.press(screen.getByTestId('barcode-scan-another'));
    await act(async () => fireEvent.press(screen.getByTestId('mock-scan')));
    expect(await screen.findByText('Added almond flour. You now have 2.')).toBeTruthy();
    const items = await pantryStore.list();
    expect(items[0]).toMatchObject({ name: 'almond flour', barcode: EAN, quantity: 2 });
  });

  it('asks for a name once when the barcode is unknown and saves the mapping', async () => {
    jest.spyOn(barcodeLookup, 'lookup').mockResolvedValue({ status: 'not_found', barcode: EAN });
    const save = jest.spyOn(barcodeLookup, 'saveUserProduct').mockResolvedValue({ barcode: EAN, name: 'Chicken breast' });
    renderScan();
    await screen.findByTestId('mock-scan');
    await act(async () => fireEvent.press(screen.getByTestId('mock-scan')));
    expect(await screen.findByText(/No product found/)).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('barcode-name-input'), 'Chicken breast');
    await act(async () => fireEvent.press(screen.getByTestId('barcode-save-button')));
    expect(await screen.findByText(/Added chicken breast/)).toBeTruthy();
    expect(save).toHaveBeenCalledWith(EAN, 'Chicken breast');
    expect(await pantryStore.list()).toEqual([
      expect.objectContaining({ name: 'chicken breast', barcode: EAN, quantity: 1 }),
    ]);
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
