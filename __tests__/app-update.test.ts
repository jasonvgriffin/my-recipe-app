import { Platform } from 'react-native';

import {
  LATEST_RELEASE_URL,
  UPDATE_MESSAGES,
  checkForUpdate,
  compareVersions,
  pickApkAsset,
  updateErrorMessage,
} from '@/lib/app-update';
import { startApkInstall } from '@/lib/app-update-install';

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

describe('install handoff', () => {
  const original = Platform.OS;
  afterEach(() => {
    jest.replaceProperty(Platform, 'OS', original);
  });

  it('does not touch native modules off Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    await expect(startApkInstall('https://example.com/app.apk', () => {})).resolves.toEqual({ kind: 'unsupported' });
  });
});

describe('v1.1.2 manifest', () => {
  it('requests install permission and can see the package installer', () => {
    const { readFileSync } = jest.requireActual('fs') as { readFileSync: (path: string, encoding: string) => string };
    const { join } = jest.requireActual('path') as { join: (...parts: string[]) => string };
    const app = JSON.parse(readFileSync(join(process.cwd(), 'app.json'), 'utf8')) as {
      expo: { version: string; android: { versionCode: number; permissions: string[] } };
    };
    expect(app.expo.version).toBe('1.1.2');
    expect(app.expo.android.versionCode).toBe(13);
    expect(app.expo.android.permissions).toContain('android.permission.REQUEST_INSTALL_PACKAGES');
    const manifest = readFileSync(
      join(process.cwd(), 'modules/recipe-share/android/src/main/AndroidManifest.xml'),
      'utf8',
    );
    expect(manifest).toContain('application/vnd.android.package-archive');
  });
});
