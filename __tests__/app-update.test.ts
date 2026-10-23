import { AppState, Platform } from 'react-native';

import {
  LATEST_RELEASE_URL,
  UPDATE_MESSAGES,
  checkForUpdate,
  compareVersions,
  pickApkAsset,
  updateErrorMessage,
} from '@/lib/app-update';
import { apkInstallConfig, claimPendingApkResume, resumeApkInstall, startApkInstall } from '@/lib/app-update-install';
import { parseReleaseNotes } from '@/lib/release-notes';

const share = {
  canRequestPackageInstalls: jest.fn(() => true),
  openUnknownAppSources: jest.fn(async () => {}),
  installApk: jest.fn(async () => {}),
  enqueueApkDownload: jest.fn(async () => 11),
  queryApkDownload: jest.fn(async (): Promise<{ state: string; bytes?: number; total?: number; contentUri?: string }> => ({
    state: 'failed',
  })),
};
const realLoadNative = apkInstallConfig.loadNative;

const CONTENT_URI = 'content://com.jasonvgriffin.myrecipeapp.FileSystemFileProvider/cached_expo_files/my-recipe-app-update.apk';

function releaseResponse(status: number, body: string, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => body,
  } as unknown as Response;
}

const apk = (name: string, url = `https://example.com/${name}`) => ({ name, browser_download_url: url });

describe('compareVersions', () => {
  it('compares numeric parts, including a leading v and a double-digit minor', () => {
    expect(compareVersions('1.1.1', 'v1.2.0')).toBe(1);
    expect(compareVersions('1.1.2', 'v1.1.2')).toBe(0);
    expect(compareVersions('1.1.2', '1.1.1')).toBe(-1);
    expect(compareVersions('1.9.9', '1.10.0')).toBe(1);
    expect(compareVersions('dev', '1.2.0')).toBeNull();
  });
});

describe('pickApkAsset', () => {
  it('prefers the versioned apk name and otherwise takes the first apk', () => {
    const assets = [apk('notes.txt'), apk('other.apk'), apk('my-recipe-app-1.2.0.apk', 'https://example.com/right.apk')];
    expect(pickApkAsset(assets, '1.2.0')).toEqual({ name: 'my-recipe-app-1.2.0.apk', url: 'https://example.com/right.apk' });
    expect(pickApkAsset([apk('notes.txt'), apk('other.apk')], '1.2.0')?.name).toBe('other.apk');
    expect(pickApkAsset([apk('notes.txt')], '1.2.0')).toBeNull();
  });
});

describe('checkForUpdate', () => {
  it('reports a newer release with its notes and apk', async () => {
    const fetchImpl = jest.fn(async () =>
      releaseResponse(
        200,
        JSON.stringify({
          tag_name: 'v1.2.0',
          body: 'Purple is the default.\n',
          assets: [apk('other.apk'), apk('my-recipe-app-1.2.0.apk', 'https://example.com/right.apk')],
        }),
      ),
    );
    await expect(checkForUpdate('1.1.2', fetchImpl)).resolves.toEqual({
      kind: 'available',
      installed: '1.1.2',
      latest: '1.2.0',
      notes: 'Purple is the default.',
      apkUrl: 'https://example.com/right.apk',
      apkName: 'my-recipe-app-1.2.0.apk',
    });
    expect(fetchImpl).toHaveBeenCalledWith(LATEST_RELEASE_URL, expect.objectContaining({ headers: expect.any(Object) }));
  });

  it('treats the same or an older release as up to date', async () => {
    const fetchImpl = jest.fn(async () => releaseResponse(200, JSON.stringify({ tag_name: 'v1.1.1', body: '', assets: [] })));
    await expect(checkForUpdate('1.1.2', fetchImpl)).resolves.toEqual({
      kind: 'up-to-date',
      installed: '1.1.2',
      latest: '1.1.1',
    });
  });

  it('names offline, rate limit, a missing apk, and an unreadable version', async () => {
    await expect(checkForUpdate('1.1.2', jest.fn(async () => { throw new TypeError('Failed to fetch'); }))).resolves.toEqual({
      kind: 'error',
      reason: 'offline',
    });
    await expect(
      checkForUpdate('1.1.2', jest.fn(async () => releaseResponse(403, JSON.stringify({ message: 'API rate limit exceeded' })))),
    ).resolves.toEqual({ kind: 'error', reason: 'rate-limit' });
    await expect(checkForUpdate('1.1.2', jest.fn(async () => releaseResponse(429, 'slow down')))).resolves.toEqual({
      kind: 'error',
      reason: 'rate-limit',
    });
    await expect(
      checkForUpdate('1.1.2', jest.fn(async () => releaseResponse(403, 'nope', { 'x-ratelimit-remaining': '0' }))),
    ).resolves.toEqual({ kind: 'error', reason: 'rate-limit' });
    await expect(checkForUpdate('1.1.2', jest.fn(async () => releaseResponse(403, 'forbidden')))).resolves.toEqual({
      kind: 'error',
      reason: 'bad-response',
    });
    await expect(
      checkForUpdate('1.1.2', jest.fn(async () => releaseResponse(200, JSON.stringify({ tag_name: 'v1.2.0', assets: [apk('notes.txt')] })))),
    ).resolves.toEqual({ kind: 'error', reason: 'no-asset' });
    await expect(checkForUpdate('1.1.2', jest.fn(async () => releaseResponse(200, '<html></html>')))).resolves.toEqual({
      kind: 'error',
      reason: 'bad-response',
    });
    await expect(checkForUpdate('1.1.2', jest.fn(async () => releaseResponse(200, JSON.stringify({ tag_name: 'nightly' }))))).resolves.toEqual({
      kind: 'error',
      reason: 'unknown-version',
    });
    await expect(checkForUpdate(undefined, jest.fn())).resolves.toEqual({ kind: 'error', reason: 'unknown-installed' });
    expect(updateErrorMessage('offline')).toBe(UPDATE_MESSAGES.offline);
    expect(updateErrorMessage('rate-limit')).toBe(UPDATE_MESSAGES.rateLimit);
    expect(updateErrorMessage('no-asset')).toBe(UPDATE_MESSAGES.noAsset);
  });
});

describe('release notes', () => {
  it('turns headings and bullets into text, and leaves a plain line alone', () => {
    expect(parseReleaseNotes('## What changed\n\n- Updates download with the screen locked\n* Notes are easier to read')).toEqual([
      { kind: 'heading', text: 'What changed' },
      { kind: 'bullet', text: 'Updates download with the screen locked' },
      { kind: 'bullet', text: 'Notes are easier to read' },
    ]);
    expect(parseReleaseNotes('1. First\n\nSee [the notes](https://example.com) and **bold**.')).toEqual([
      { kind: 'bullet', text: 'First' },
      { kind: 'paragraph', text: 'See the notes and bold.' },
    ]);
    expect(parseReleaseNotes('Plain note.')).toEqual([{ kind: 'paragraph', text: 'Plain note.' }]);
  });
});

describe('install handoff', () => {
  const original = Platform.OS;
  const originalState = AppState.currentState;

  beforeEach(() => {
    apkInstallConfig.pollMs = 0;
    apkInstallConfig.loadNative = async () => share;
    share.canRequestPackageInstalls.mockReset();
    share.canRequestPackageInstalls.mockReturnValue(true);
    share.installApk.mockReset();
    share.installApk.mockResolvedValue(undefined);
    share.enqueueApkDownload.mockReset();
    share.enqueueApkDownload.mockResolvedValue(11);
    share.queryApkDownload.mockReset();
    share.queryApkDownload.mockResolvedValue({ state: 'failed' });
    (AppState as { currentState: string | null }).currentState = 'active';
    claimPendingApkResume();
  });

  afterEach(() => {
    apkInstallConfig.pollMs = 500;
    apkInstallConfig.loadNative = realLoadNative;
    jest.replaceProperty(Platform, 'OS', original);
    (AppState as { currentState: string | null }).currentState = originalState;
  });

  it('does not touch native modules off Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    await expect(startApkInstall('https://example.com/app.apk', () => {})).resolves.toEqual({ kind: 'unsupported' });
    expect(share.enqueueApkDownload).not.toHaveBeenCalled();
  });

  it('polls DownloadManager and opens the installer when the app is in front', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    share.queryApkDownload
      .mockResolvedValueOnce({ state: 'running', bytes: 42, total: 100 })
      .mockResolvedValueOnce({ state: 'successful', contentUri: CONTENT_URI });
    const seen: (number | null)[] = [];
    await expect(startApkInstall('https://example.com/app.apk', (percent) => seen.push(percent))).resolves.toEqual({ kind: 'installed' });
    expect(seen).toEqual([42, 100]);
    expect(share.enqueueApkDownload).toHaveBeenCalledWith('https://example.com/app.apk');
    expect(share.installApk).toHaveBeenCalledWith(CONTENT_URI);
  });

  it('waits for the next resume when the download finishes in the background', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    (AppState as { currentState: string }).currentState = 'background';
    share.queryApkDownload.mockResolvedValue({ state: 'successful', contentUri: CONTENT_URI });
    await expect(startApkInstall('https://example.com/app.apk', () => {})).resolves.toEqual({
      kind: 'awaiting-resume',
      contentUri: CONTENT_URI,
    });
    expect(share.installApk).not.toHaveBeenCalled();
    expect(claimPendingApkResume()).toBe(CONTENT_URI);
    expect(claimPendingApkResume()).toBeNull();
    await expect(resumeApkInstall(CONTENT_URI)).resolves.toEqual({ kind: 'installed' });
    expect(share.installApk).toHaveBeenCalledWith(CONTENT_URI);
  });

  it('asks for permission before downloading, and reports a failed download', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    share.canRequestPackageInstalls.mockReturnValue(false);
    await expect(startApkInstall('https://example.com/app.apk', () => {})).resolves.toEqual({ kind: 'needs-permission' });
    expect(share.enqueueApkDownload).not.toHaveBeenCalled();

    share.canRequestPackageInstalls.mockReturnValue(true);
    share.queryApkDownload.mockResolvedValue({ state: 'failed' });
    await expect(startApkInstall('https://example.com/app.apk', () => {})).resolves.toEqual({
      kind: 'error',
      message: UPDATE_MESSAGES.downloadFailed,
    });
    share.enqueueApkDownload.mockRejectedValue(new Error('disabled'));
    await expect(startApkInstall('https://example.com/app.apk', () => {})).resolves.toEqual({
      kind: 'error',
      message: UPDATE_MESSAGES.downloadFailed,
    });
    expect(share.installApk).not.toHaveBeenCalled();
  });
});

describe('v1.1.5 manifest', () => {
  it('requests install permission and downloads through DownloadManager without a new permission', () => {
    const { readFileSync } = jest.requireActual('fs') as { readFileSync: (path: string, encoding: string) => string };
    const { join } = jest.requireActual('path') as { join: (...parts: string[]) => string };
    const app = JSON.parse(readFileSync(join(process.cwd(), 'app.json'), 'utf8')) as {
      expo: { version: string; android: { versionCode: number; permissions: string[]; blockedPermissions: string[] } };
    };
    expect(app.expo.version).toBe('1.1.5');
    expect(app.expo.android.versionCode).toBe(16);
    expect(app.expo.android.permissions).toEqual([
      'android.permission.VIBRATE',
      'android.permission.REQUEST_INSTALL_PACKAGES',
    ]);
    expect(app.expo.android.blockedPermissions).toContain('android.permission.POST_NOTIFICATIONS');
    const manifest = readFileSync(join(process.cwd(), 'modules/recipe-share/android/src/main/AndroidManifest.xml'), 'utf8');
    expect(manifest).toContain('application/vnd.android.package-archive');
    expect(manifest).not.toContain('POST_NOTIFICATIONS');
    const kotlin = readFileSync(
      join(process.cwd(), 'modules/recipe-share/android/src/main/java/expo/modules/recipeshare/ApkInstallModule.kt'),
      'utf8',
    );
    expect(kotlin).toContain('DownloadManager');
    expect(kotlin).toContain('VISIBILITY_VISIBLE_NOTIFY_COMPLETED');
    expect(kotlin).toContain('FileSystemFileProvider');
    const install = readFileSync(join(process.cwd(), 'src/lib/app-update-install.ts'), 'utf8');
    expect(install).not.toContain('expo-file-system');
    expect(install).toContain('enqueueApkDownload');
  });
});
