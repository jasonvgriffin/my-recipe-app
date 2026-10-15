/**
 * Download a release APK with Android's DownloadManager and hand it to the
 * package installer (v1.1.4). DownloadManager keeps going while the screen is
 * locked and posts the system download notification.
 *
 * The installer still receives a content URI from this app's FileSystemFileProvider
 * (`installApk`). Web and iOS return `unsupported` before any native module is loaded.
 */
import { AppState, Platform } from 'react-native';

import { UPDATE_MESSAGES } from '@/lib/app-update';

export type InstallResult =
  | { kind: 'installed' }
  | { kind: 'needs-permission' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string }
  | { kind: 'awaiting-resume'; contentUri: string };

type NativeApkInstall = {
  canRequestPackageInstalls: () => boolean;
  openUnknownAppSources: () => Promise<void>;
  enqueueApkDownload: (url: string) => Promise<number>;
  queryApkDownload: (id: number) => Promise<unknown>;
  installApk: (contentUri: string) => Promise<void>;
};

/** Poll interval, and the native loader. Tests replace `loadNative` so Jest does not dynamic-import. */
export const apkInstallConfig = {
  pollMs: 500,
  loadNative: (): Promise<NativeApkInstall> => import('recipe-share'),
};

let pendingResumeUri: string | null = null;

/**
 * Take the content URI of a download that finished while the app was in the
 * background. A second caller gets null, so the installer opens once.
 */
export function claimPendingApkResume(): string | null {
  const uri = pendingResumeUri;
  pendingResumeUri = null;
  return uri;
}

type DownloadSnapshot =
  | { state: 'running'; bytes: number; total: number }
  | { state: 'successful'; contentUri: string }
  | { state: 'failed' };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function inForeground(): boolean {
  return AppState.currentState === 'active';
}

function asSnapshot(raw: unknown): DownloadSnapshot {
  if (!raw || typeof raw !== 'object') return { state: 'failed' };
  const row = raw as { state?: unknown; bytes?: unknown; total?: unknown; contentUri?: unknown };
  if (row.state === 'running') {
    return {
      state: 'running',
      bytes: typeof row.bytes === 'number' ? row.bytes : 0,
      total: typeof row.total === 'number' ? row.total : -1,
    };
  }
  if (row.state === 'successful' && typeof row.contentUri === 'string' && row.contentUri.startsWith('content:')) {
    return { state: 'successful', contentUri: row.contentUri };
  }
  return { state: 'failed' };
}

function percentFrom(bytes: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.min(100, Math.round((bytes / total) * 100));
}

async function installContentUri(contentUri: string): Promise<InstallResult> {
  if (!contentUri.startsWith('content:')) return { kind: 'error', message: UPDATE_MESSAGES.installerFailed };
  const { installApk } = await apkInstallConfig.loadNative();
  try {
    await installApk(contentUri);
  } catch {
    return { kind: 'error', message: UPDATE_MESSAGES.installerFailed };
  }
  return { kind: 'installed' };
}

/** Open the installer for an APK that already finished downloading. */
export async function resumeApkInstall(contentUri: string): Promise<InstallResult> {
  if (Platform.OS !== 'android') return { kind: 'unsupported' };
  const { canRequestPackageInstalls } = await apkInstallConfig.loadNative();
  if (!canRequestPackageInstalls()) return { kind: 'needs-permission' };
  return installContentUri(contentUri);
}

export async function canInstallPackages(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const { canRequestPackageInstalls } = await apkInstallConfig.loadNative();
  return canRequestPackageInstalls();
}

export async function openInstallPermissionSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const { openUnknownAppSources } = await apkInstallConfig.loadNative();
  await openUnknownAppSources();
}

/**
 * Enqueue `apkUrl` on DownloadManager and poll until it finishes.
 * Calls `onProgress` with 0–100, or null when the length is unknown.
 * Opens the installer immediately when the app is in the foreground.
 * Otherwise returns `awaiting-resume` and keeps the content URI for the next resume.
 */
export async function startApkInstall(
  apkUrl: string,
  onProgress: (percent: number | null) => void,
): Promise<InstallResult> {
  if (Platform.OS !== 'android') return { kind: 'unsupported' };
  const { canRequestPackageInstalls, enqueueApkDownload, queryApkDownload } = await apkInstallConfig.loadNative();
  if (!canRequestPackageInstalls()) return { kind: 'needs-permission' };
  let id: number;
  try {
    id = await enqueueApkDownload(apkUrl);
  } catch {
    return { kind: 'error', message: UPDATE_MESSAGES.downloadFailed };
  }
  try {
    for (;;) {
      const snap = asSnapshot(await queryApkDownload(id));
      if (snap.state === 'failed') return { kind: 'error', message: UPDATE_MESSAGES.downloadFailed };
      if (snap.state === 'successful') {
        onProgress(100);
        if (!inForeground()) {
          pendingResumeUri = snap.contentUri;
          return { kind: 'awaiting-resume', contentUri: snap.contentUri };
        }
        return installContentUri(snap.contentUri);
      }
      onProgress(percentFrom(snap.bytes, snap.total));
      await sleep(apkInstallConfig.pollMs);
    }
  } catch {
    return { kind: 'error', message: UPDATE_MESSAGES.downloadFailed };
  }
}
