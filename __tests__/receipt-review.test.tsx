import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { recognizeReceiptText } from '@/receipts/ocr';
import { pantryStore } from '@/storage/pantry';
import { receiptAliasStore } from '@/storage/receipt-aliases';

import { GROCERY_RECEIPT as fixture } from './fixtures/receipt-grocery';

jest.mock('@/receipts/ocr', () => ({
  recognizeReceiptText: jest.fn(),
}));

const picker = () => require('expo-image-picker') as {
  requestCameraPermissionsAsync: jest.Mock;
  launchCameraAsync: jest.Mock;
};

beforeEach(async () => {
  await require('@react-native-async-storage/async-storage').clear();
  picker().requestCameraPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' });
  picker().launchCameraAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://receipt.jpg' }] });
  (recognizeReceiptText as jest.Mock).mockResolvedValue(fixture);
});

function renderReceipt() {
  const Receipt = require('@/app/pantry/receipt').default;
  renderRouter({ index: Receipt }, { initialUrl: '/' });
}

describe('receipt review screen (spec #26)', () => {
  it('photographs a receipt, lets the user correct a line, and increments the pantry', async () => {
    await pantryStore.saveDetails({ name: 'almond flour', quantity: 1, unit: 'bag' });
    renderReceipt();
    await act(async () => fireEvent.press(await screen.findByTestId('receipt-camera-button')));
    expect(await screen.findByTestId('receipt-line-line-1')).toBeTruthy();
    expect(screen.getByText('eggs')).toBeTruthy();
    expect(screen.queryByText(/visa/i)).toBeNull();

    fireEvent.press(screen.getByTestId('receipt-line-line-1'));
    expect(screen.getByTestId('receipt-name-input').props.value).not.toBe('chicken breast');
    fireEvent.changeText(screen.getByTestId('receipt-name-input'), 'chicken breast');
    await act(async () => fireEvent.press(screen.getByTestId('receipt-apply-button')));

    expect(await screen.findByTestId('receipt-applied')).toHaveTextContent(/Added \d+ items/);
    const items = await pantryStore.list();
    expect(items.find((item) => item.name === 'chicken breast')).toMatchObject({ quantity: 1 });
    expect(items.find((item) => item.name === 'almond flour')).toMatchObject({ quantity: 2, unit: 'bag' });
    const aliases = await receiptAliasStore.list();
    expect(aliases).toEqual([expect.objectContaining({ alias: 'gv bnls chkn', name: 'chicken breast' })]);
  });

  it('skips a line the user marks and reports a denied camera permission', async () => {
    renderReceipt();
    await act(async () => fireEvent.press(await screen.findByTestId('receipt-camera-button')));
    await screen.findByTestId('receipt-line-line-3');
    fireEvent.press(screen.getByTestId('receipt-line-line-3'));
    fireEvent(screen.getByTestId('receipt-skip'), 'valueChange', true);
    await act(async () => fireEvent.press(screen.getByTestId('receipt-apply-button')));
    const names = (await pantryStore.list()).map((item) => item.name);
    expect(names).not.toContain('eggs');
    expect(names.length).toBeGreaterThan(0);

    picker().requestCameraPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true, status: 'denied' });
    await act(async () => fireEvent.press(screen.getByTestId('receipt-camera-button')));
    expect(await screen.findByTestId('receipt-permission-message')).toHaveTextContent(/Camera access is needed/);
  });
});
