/**
 * Download a release APK and hand it to Android's package installer (v1.1.2).
 * Web and iOS return `unsupported` before any native module is loaded.
 */
import { Platform } from 'react-native';

import { UPDATE_MESSAGES } from '@/lib/app-update';

export type InstallResult =
  | { kind: 'installed' }
  | { kind: 'needs-permission' }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

export async function canInstallPackages(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const { canRequestPackageInstalls } = await import('recipe-share');
  return canRequestPackageInstalls();
}

export async function openInstallPermissionSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const { openUnknownAppSources } = await import('recipe-share');
  await openUnknownAppSources();
}

/**
 * Download `apkUrl` into the app cache and open the system installer.
 * Calls `onProgress` with 0–100, or null when the server sent no length.
 */
export async function startApkInstall(
  apkUrl: string,
  onProgress: (percent: number | null) => void,
): Promise<InstallResult> {
  if (Platform.OS !== 'android') return { kind: 'unsupported' };
  const { canRequestPackageInstalls, installApk } = await import('recipe-share');
  if (!canRequestPackageInstalls()) return { kind: 'needs-permission' };
  try {
    const { File, Paths } = await import('expo-file-system');
    const destination = new File(Paths.cache, 'my-recipe-app-update.apk');
    if (destination.exists) destination.delete();
    const task = File.createDownloadTask(apkUrl, destination, {
      headers: { Accept: 'application/octet-stream', 'User-Agent': 'MyRecipeApp' },
      onProgress: (progress) => {
        if (typeof progress.totalBytes === 'number' && progress.totalBytes > 0) {
          onProgress(Math.min(100, Math.round((progress.bytesWritten / progress.totalBytes) * 100)));
        } else {
          onProgress(null);
        }
      },
    });
    const file = await task.downloadAsync();
    if (!file) return { kind: 'error', message: UPDATE_MESSAGES.downloadFailed };
    const contentUri = file.contentUri;
    if (typeof contentUri !== 'string' || !contentUri.startsWith('content:')) {
      return { kind: 'error', message: UPDATE_MESSAGES.installerFailed };
    }
    try {
      await installApk(contentUri);
    } catch {
      return { kind: 'error', message: UPDATE_MESSAGES.installerFailed };
    }
    return { kind: 'installed' };
  } catch {
    return { kind: 'error', message: UPDATE_MESSAGES.downloadFailed };
  }
}
