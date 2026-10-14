/**
 * Settings → Updates (v1.1.2). The check runs only from the button. Web does not install.
 */
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Platform } from 'react-native';

import { UPDATE_MESSAGES } from '@/lib/app-update';

const mockInstall = {
  canInstallPackages: jest.fn(async () => true),
  openInstallPermissionSettings: jest.fn(async () => {}),
  startApkInstall: jest.fn(async (..._args: unknown[]) => ({ kind: 'installed' as const })) as jest.Mock,
};

jest.mock('@/lib/app-update-install', () => mockInstall);
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.1.2' } } }));

const routes = () => ({
  _layout: require('@/app/_layout').default,
  '(tabs)/_layout': require('@/app/(tabs)/_layout').default,
  '(tabs)/index': require('@/app/(tabs)/index').default,
  '(tabs)/more': require('@/app/(tabs)/more').default,
  '(tabs)/add-menu': require('@/app/(tabs)/add-menu').default,
  settings: require('@/app/settings').default,
});

function jsonRelease(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

const fetchMock = jest.fn<Promise<Response>, [string, RequestInit?]>();

beforeAll(() => {
  routes();
}, 60_000);

beforeEach(async () => {
  await require('@react-native-async-storage/async-storage').clear();
  fetchMock.mockReset();
  mockInstall.canInstallPackages.mockReset();
  mockInstall.canInstallPackages.mockResolvedValue(true);
  mockInstall.openInstallPermissionSettings.mockReset();
  mockInstall.startApkInstall.mockReset();
  mockInstall.startApkInstall.mockResolvedValue({ kind: 'installed' });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  jest.replaceProperty(Platform, 'OS', 'ios');
});

async function openSettings() {
  renderRouter(routes(), { initialUrl: '/settings' });
  return screen.findByTestId('settings-check-updates');
}

describe('Settings updates', () => {
  it('does not check until the button is pressed, then says the app is current', async () => {
    fetchMock.mockResolvedValue(jsonRelease({ tag_name: 'v1.1.1', body: '', assets: [] }));
    const button = await openSettings();
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(button);
    });
    expect(await screen.findByText(UPDATE_MESSAGES.upToDate)).toBeTruthy();
  });

  it('shows the newer version, the notes, and Update', async () => {
    fetchMock.mockResolvedValue(
      jsonRelease({
        tag_name: 'v1.2.0',
        body: 'Notes for the next build.',
        assets: [{ name: 'my-recipe-app-1.2.0.apk', browser_download_url: 'https://example.com/app.apk' }],
      }),
    );
    const button = await openSettings();
    await act(async () => {
      fireEvent.press(button);
    });
    expect(await screen.findByText('Version 1.2.0')).toBeTruthy();
    expect(screen.getByTestId('settings-update-notes')).toHaveTextContent('Notes for the next build.');
    expect(screen.getByTestId('settings-install-update')).toBeTruthy();
  });

  it('shows a distinct message for offline, rate limit, and a release with no apk', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const button = await openSettings();
    await act(async () => {
      fireEvent.press(button);
    });
    expect(await screen.findByTestId('settings-update-error')).toHaveTextContent(UPDATE_MESSAGES.offline);

    fetchMock.mockResolvedValue(jsonRelease(JSON.stringify({ message: 'API rate limit exceeded' }), 403));
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-check-updates'));
    });
    expect(await screen.findByText(UPDATE_MESSAGES.rateLimit)).toBeTruthy();

    fetchMock.mockResolvedValue(jsonRelease({ tag_name: 'v9.0.0', assets: [{ name: 'readme.txt', browser_download_url: 'https://example.com/r' }] }));
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-check-updates'));
    });
    expect(await screen.findByText(UPDATE_MESSAGES.noAsset)).toBeTruthy();
  });

  it('does not download or install on web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    fetchMock.mockResolvedValue(
      jsonRelease({
        tag_name: 'v1.2.0',
        body: 'Notes',
        assets: [{ name: 'my-recipe-app-1.2.0.apk', browser_download_url: 'https://example.com/app.apk' }],
      }),
    );
    const button = await openSettings();
    await act(async () => {
      fireEvent.press(button);
    });
    const update = await screen.findByTestId('settings-install-update');
    await act(async () => {
      fireEvent.press(update);
    });
    expect(mockInstall.startApkInstall).not.toHaveBeenCalled();
    expect(screen.getByText('Version 1.2.0')).toBeTruthy();
  });

  it('downloads with progress and then asks Android to install', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    let finish: (result: { kind: 'installed' }) => void = () => {};
    mockInstall.startApkInstall.mockImplementation(async (_url: string, onProgress: (percent: number | null) => void) => {
      onProgress(42);
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    fetchMock.mockResolvedValue(
      jsonRelease({
        tag_name: 'v1.2.0',
        body: 'Notes',
        assets: [{ name: 'app.apk', browser_download_url: 'https://example.com/app.apk' }],
      }),
    );
    const button = await openSettings();
    await act(async () => {
      fireEvent.press(button);
    });
    const update = await screen.findByTestId('settings-install-update');
    await act(async () => {
      fireEvent.press(update);
    });
    expect(await screen.findByText('Downloading 42%')).toBeTruthy();
    await act(async () => {
      finish({ kind: 'installed' });
    });
    expect(await screen.findByText(UPDATE_MESSAGES.handedOff)).toBeTruthy();
    expect(mockInstall.startApkInstall).toHaveBeenCalledWith('https://example.com/app.apk', expect.any(Function));
  });

  it('asks for the unknown-apps permission before downloading', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockInstall.canInstallPackages.mockResolvedValue(false);
    fetchMock.mockResolvedValue(
      jsonRelease({
        tag_name: 'v1.2.0',
        body: '',
        assets: [{ name: 'app.apk', browser_download_url: 'https://example.com/app.apk' }],
      }),
    );
    const button = await openSettings();
    await act(async () => {
      fireEvent.press(button);
    });
    const update = await screen.findByTestId('settings-install-update');
    await act(async () => {
      fireEvent.press(update);
    });
    expect(await screen.findByText(UPDATE_MESSAGES.needsPermission)).toBeTruthy();
    expect(mockInstall.startApkInstall).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-allow-installs'));
    });
    expect(mockInstall.openInstallPermissionSettings).toHaveBeenCalled();
  });
});
