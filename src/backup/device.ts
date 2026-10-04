/**
 * Phone side of backup & restore (v1.0.6; v1.0.7 .zip + "Save as"): files via expo-file-system, sharing via the
 * app's share sheet module, the system file picker (Storage Access Framework) for import and a single-file
 * "Save as" (SAF ACTION_CREATE_DOCUMENT, RecipeShare.saveDocumentAsync) for export — so it saves straight to Google
 * Drive or a phone folder (the v1.0.6 folder picker showed "Can't use this folder" on Drive's root). No storage
 * permissions: SAF and the share sheet grant access per file.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { saveDocumentAsync } from 'recipe-share';

import { appVersion } from '@/config';
import { presentShare } from '@/lib/present-share';
import { RECIPE_PHOTO_DIR } from '@/lib/photo-path';
import { settingsStore } from '@/storage/settings';
import { appCollections } from '@/storage/app-collections';

import { createBackup, restoreBackup, type BackupDeps, type PhotoStore, type RestoreMode, type RestoreResult } from './backup';
import {
  BACKUP_MIME,
  BACKUP_PICKER_MIME_TYPES,
  backupFileName,
  encodeBackupZip,
  parseBackupFile,
  type Backup,
  type ParseResult,
} from './format';

function photoDir(): Directory {
  const dir = new Directory(Paths.document, RECIPE_PHOTO_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export const devicePhotoStore: PhotoStore = {
  isLocal: (uri) => uri.startsWith('file://') && uri.includes(`${RECIPE_PHOTO_DIR}/`),
  async read(uri) {
    try {
      const file = new File(uri);
      return file.exists ? await file.base64() : undefined;
    } catch {
      return undefined;
    }
  },
  async write(name, base64) {
    const safe = name.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 120) || 'photo.jpg';
    const file = new File(photoDir(), safe);
    if (file.exists) file.delete();
    file.create();
    file.write(base64, { encoding: 'base64' });
    return file.uri;
  },
};

export function deviceBackupDeps(): BackupDeps {
  return {
    collections: appCollections(),
    settings: settingsStore,
    photos: devicePhotoStore,
    appVersion: appVersion() ?? undefined,
  };
}

/** Build the backup and write it to the cache folder. Returns the file and how much it holds. */
export async function writeBackupFile(deps: BackupDeps = deviceBackupDeps()): Promise<{ file: File; backup: Backup }> {
  const backup = await createBackup(deps);
  const dir = new Directory(Paths.cache, 'backups');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, backupFileName(new Date()));
  if (file.exists) file.delete();
  file.create();
  file.write(encodeBackupZip(backup));
  return { file, backup };
}

/** Export → Android share sheet (Drive, Gmail, Files, Nearby Share, …). */
export async function shareBackup(): Promise<Backup> {
  const { file, backup } = await writeBackupFile();
  await presentShare({ fileUri: file.uri, mimeType: BACKUP_MIME, title: 'My Recipe App backup' });
  return backup;
}

/**
 * Export → "Save as…" (v1.0.7): one system save dialog where the user picks Google Drive, Downloads or any folder
 * and the file name. Returns null when cancelled.
 */
export async function saveBackupAs(): Promise<Backup | null> {
  const { file, backup } = await writeBackupFile();
  if (Platform.OS === 'android') {
    const saved = await saveDocumentAsync({ fileUri: file.uri, fileName: file.name, mimeType: BACKUP_MIME });
    return saved ? backup : null;
  }
  // Other platforms: the share sheet's "Save to Files" covers it.
  await presentShare({ fileUri: file.uri, mimeType: BACKUP_MIME, title: 'My Recipe App backup' });
  return backup;
}

/** Import step 1: pick a file (SAF; .zip or old .myrecipe) and validate it. Null when cancelled. */
export async function pickBackupFile(): Promise<ParseResult | null> {
  const picked = await File.pickFileAsync({ mimeTypes: BACKUP_PICKER_MIME_TYPES });
  if (picked.canceled || !picked.result) return null;
  try {
    return parseBackupFile(await picked.result.bytes());
  } catch {
    return { ok: false, error: 'Could not read that file.' };
  }
}

/** Import step 2 (after the preview + confirmation). */
export function restoreFromBackup(backup: Backup, mode: RestoreMode): Promise<RestoreResult> {
  return restoreBackup(backup, mode, deviceBackupDeps());
}
