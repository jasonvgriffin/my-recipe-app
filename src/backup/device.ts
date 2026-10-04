/**
 * Phone side of backup & restore (v1.0.6): files via expo-file-system, sharing via the app's share sheet module,
 * the system file picker (Storage Access Framework) for import and "Save to…" for export. No storage
 * permissions: SAF and the share sheet grant access per file.
 */
import { Directory, File, Paths } from 'expo-file-system';

import { appVersion } from '@/config';
import { presentShare } from '@/lib/present-share';
import { RECIPE_PHOTO_DIR } from '@/lib/photo-path';
import { settingsStore } from '@/storage/settings';
import { appCollections } from '@/storage/app-collections';

import { createBackup, restoreBackup, type BackupDeps, type PhotoStore, type RestoreMode, type RestoreResult } from './backup';
import { BACKUP_MIME, backupFileName, parseBackup, type Backup, type ParseResult } from './format';

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
  file.write(JSON.stringify(backup));
  return { file, backup };
}

/** Export → Android share sheet (Drive, Gmail, Files, Nearby Share, …). */
export async function shareBackup(): Promise<Backup> {
  const { file, backup } = await writeBackupFile();
  await presentShare({ fileUri: file.uri, mimeType: BACKUP_MIME, title: 'My Recipe App backup' });
  return backup;
}

/** Export → "Save to…" a folder the user picks (SAF). Returns null when the picker is cancelled. */
export async function saveBackupToFolder(): Promise<Backup | null> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    return null; // cancelled
  }
  const { file, backup } = await writeBackupFile();
  const out = folder.createFile(file.name, BACKUP_MIME);
  out.write(await file.text());
  return backup;
}

/** Import step 1: pick a file (SAF) and validate it. Null when cancelled. */
export async function pickBackupFile(): Promise<ParseResult | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'application/octet-stream', '*/*'] });
  if (picked.canceled || !picked.result) return null;
  try {
    return parseBackup(await picked.result.text());
  } catch {
    return { ok: false, error: 'Could not read that file.' };
  }
}

/** Import step 2 (after the preview + confirmation). */
export function restoreFromBackup(backup: Backup, mode: RestoreMode): Promise<RestoreResult> {
  return restoreBackup(backup, mode, deviceBackupDeps());
}
