import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Alert } from 'react-native';

import { BACKUP_FORMAT, parseBackup } from '@/backup';

const mockDevice = {
  shareBackup: jest.fn(),
  saveBackupToFolder: jest.fn(),
  pickBackupFile: jest.fn(),
  restoreFromBackup: jest.fn(),
};
jest.mock('@/backup/device', () => mockDevice);

const FILE = JSON.stringify({
  format: BACKUP_FORMAT,
  version: 1,
  exportedAt: '2026-10-04T12:00:00.000Z',
  appVersion: '1.0.6',
  data: { recipes: [{ id: 'r1', title: 'Soup' }, { id: 'r2', title: 'Stew' }], meal_plan_entries: [{ id: 'm1' }] },
  settings: { unitSystem: 'metric' },
  photos: { r1: { name: 'r1.jpg', base64: 'QUJD' } },
});

function open() {
  renderRouter(
    { _layout: require('@/app/_layout').default, settings: require('@/app/settings').default, backup: require('@/app/backup').default },
    { initialUrl: '/settings' },
  );
}

describe('Settings → Backup & restore (v1.0.6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDevice.shareBackup.mockResolvedValue({ data: { recipes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } });
    mockDevice.pickBackupFile.mockResolvedValue(parseBackup(FILE));
    mockDevice.restoreFromBackup.mockResolvedValue({ added: 3, updated: 0, kept: 0, removed: 2, photos: 1, settings: true });
  });
  afterEach(() => jest.restoreAllMocks());

  it('opens from Settings and exports through the share sheet', async () => {
    open();
    await act(async () => fireEvent.press(await screen.findByTestId('backup-settings-link')));
    expect(await screen.findByTestId('backup-screen')).toBeTruthy();
    expect(screen.getByTestId('section-title')).toHaveTextContent('Backup & restore');
    await act(async () => fireEvent.press(screen.getByTestId('backup-share')));
    expect(mockDevice.shareBackup).toHaveBeenCalled();
    expect(screen.getByTestId('backup-message')).toHaveTextContent('Backup ready: 3 recipes.');
  });

  it('previews a backup, then merges', async () => {
    open();
    await act(async () => fireEvent.press(await screen.findByTestId('backup-settings-link')));
    await act(async () => fireEvent.press(await screen.findByTestId('backup-pick')));
    const preview = screen.getByTestId('backup-preview');
    expect(preview).toHaveTextContent(/2 recipes/);
    expect(preview).toHaveTextContent(/1 photo\b/);
    expect(preview).toHaveTextContent(/1 meal plan entry/);
    expect(preview).toHaveTextContent(/Settings and appearance/);
    expect(preview).toHaveTextContent(/app 1\.0\.6/);
    await act(async () => fireEvent.press(screen.getByTestId('backup-merge')));
    expect(mockDevice.restoreFromBackup).toHaveBeenCalledWith(expect.objectContaining({ format: BACKUP_FORMAT }), 'merge');
    expect(screen.queryByTestId('backup-preview')).toBeNull();
    expect(screen.getByTestId('backup-message')).toHaveTextContent(/Restored: 3 items added/);
  });

  it('asks before replacing, and does nothing when cancelled', async () => {
    let answer = 'Cancel';
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      (buttons ?? []).find((b) => b.text === answer)?.onPress?.();
    });
    open();
    await act(async () => fireEvent.press(await screen.findByTestId('backup-settings-link')));
    await act(async () => fireEvent.press(await screen.findByTestId('backup-pick')));
    await act(async () => fireEvent.press(screen.getByTestId('backup-replace')));
    expect(alert).toHaveBeenCalledWith('Replace everything?', expect.any(String), expect.any(Array));
    expect(mockDevice.restoreFromBackup).not.toHaveBeenCalled();
    answer = 'Replace';
    await act(async () => fireEvent.press(screen.getByTestId('backup-replace')));
    expect(mockDevice.restoreFromBackup).toHaveBeenCalledWith(expect.anything(), 'replace');
    expect(screen.getByTestId('backup-message')).toHaveTextContent(/2 removed/);
  });

  it('shows why a file was rejected', async () => {
    mockDevice.pickBackupFile.mockResolvedValue(parseBackup('nope'));
    open();
    await act(async () => fireEvent.press(await screen.findByTestId('backup-settings-link')));
    await act(async () => fireEvent.press(await screen.findByTestId('backup-pick')));
    expect(screen.getByTestId('backup-error')).toHaveTextContent('This is not a My Recipe App backup file.');
    expect(screen.queryByTestId('backup-preview')).toBeNull();
  });
});
