/**
 * GitHub release check for the in-app updater (v1.1.2). Pure: no React, no React Native.
 * Settings calls this only when the user taps "Check for updates". Web may call it too;
 * installing the APK is Android-only (`src/lib/app-update-install.ts`).
 */

export const LATEST_RELEASE_URL = 'https://api.github.com/repos/jasonvgriffin/my-recipe-app/releases/latest';

export const UPDATE_MESSAGES = {
  upToDate: "You're on the latest version",
  offline: "You're offline. Check the connection and try again.",
  rateLimit: 'GitHub is limiting update checks. Try again in a little while.',
  noAsset: 'This release has no install file yet.',
  badResponse: "Couldn't check for updates. Try again.",
  unknownVersion: "Couldn't read the latest version.",
  unknownInstalled: "Couldn't read this app's version.",
  downloadFailed: "Couldn't download the update. Try again.",
  installerFailed: "Couldn't open the Android installer. Try again.",
  needsPermission: 'Allow this app to install updates, then come back and tap Update.',
  handedOff: 'Confirm the install on the next screen.',
} as const;

export type UpdateErrorReason = 'offline' | 'rate-limit' | 'no-asset' | 'bad-response' | 'unknown-version' | 'unknown-installed';

export type UpdateCheck =
  | { kind: 'up-to-date'; installed: string; latest: string }
  | { kind: 'available'; installed: string; latest: string; notes: string; apkUrl: string; apkName: string }
  | { kind: 'error'; reason: UpdateErrorReason };

export function updateErrorMessage(reason: UpdateErrorReason): string {
  switch (reason) {
    case 'offline':
      return UPDATE_MESSAGES.offline;
    case 'rate-limit':
      return UPDATE_MESSAGES.rateLimit;
    case 'no-asset':
      return UPDATE_MESSAGES.noAsset;
    case 'unknown-version':
      return UPDATE_MESSAGES.unknownVersion;
    case 'unknown-installed':
      return UPDATE_MESSAGES.unknownInstalled;
    default:
      return UPDATE_MESSAGES.badResponse;
  }
}

/** `v1.2.3` or `1.2.3` → [1, 2, 3]. Anything else is not a release we can compare. */
export function parseVersion(raw: string): [number, number, number] | null {
  const match = raw.trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Positive when `latest` is newer than `installed`. Null when either side is not x.y.z. */
export function compareVersions(installed: string, latest: string): -1 | 0 | 1 | null {
  const left = parseVersion(installed);
  const right = parseVersion(latest);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    if (right[i] > left[i]) return 1;
    if (right[i] < left[i]) return -1;
  }
  return 0;
}

interface ReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

/** Prefer `my-recipe-app-<version>.apk`, otherwise the first `.apk`. */
export function pickApkAsset(assets: ReleaseAsset[] | undefined, version: string): { name: string; url: string } | null {
  const apks = (assets ?? []).flatMap((asset) => {
    const name = asset.name ?? '';
    const url = asset.browser_download_url ?? '';
    if (!name.toLowerCase().endsWith('.apk') || !url) return [];
    return [{ name, url }];
  });
  if (apks.length === 0) return null;
  const preferred = `my-recipe-app-${version}.apk`.toLowerCase();
  return apks.find((asset) => asset.name.toLowerCase() === preferred) ?? apks[0];
}

interface ReleaseResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  headers?: { get(name: string): string | null };
}

function isRateLimit(status: number, text: string, remaining: string | null): boolean {
  if (status === 429) return true;
  if (remaining === '0') return true;
  return status === 403 && /rate limit/i.test(text);
}

export async function checkForUpdate(installed: string | undefined, fetchImpl: typeof fetch = fetch): Promise<UpdateCheck> {
  if (!installed || !parseVersion(installed)) return { kind: 'error', reason: 'unknown-installed' };
  let response: ReleaseResponse;
  try {
    response = await fetchImpl(LATEST_RELEASE_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `MyRecipeApp/${installed}`,
      },
    });
  } catch {
    return { kind: 'error', reason: 'offline' };
  }
  let text = '';
  try {
    text = await response.text();
  } catch {
    return { kind: 'error', reason: 'offline' };
  }
  const remaining = response.headers?.get('x-ratelimit-remaining') ?? null;
  if (!response.ok) {
    return { kind: 'error', reason: isRateLimit(response.status, text, remaining) ? 'rate-limit' : 'bad-response' };
  }
  let body: { tag_name?: string; name?: string; body?: string | null; assets?: ReleaseAsset[] };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    return { kind: 'error', reason: 'bad-response' };
  }
  const latestRaw = body.tag_name || body.name || '';
  const latest = parseVersion(latestRaw);
  if (!latest) return { kind: 'error', reason: 'unknown-version' };
  const latestLabel = `${latest[0]}.${latest[1]}.${latest[2]}`;
  const order = compareVersions(installed, latestLabel);
  if (order === null) return { kind: 'error', reason: 'unknown-version' };
  if (order <= 0) return { kind: 'up-to-date', installed, latest: latestLabel };
  const apk = pickApkAsset(body.assets, latestLabel);
  if (!apk) return { kind: 'error', reason: 'no-asset' };
  return {
    kind: 'available',
    installed,
    latest: latestLabel,
    notes: (body.body ?? '').trim(),
    apkUrl: apk.url,
    apkName: apk.name,
  };
}
