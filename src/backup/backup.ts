/**
 * Build and restore backups (v1.0.6, docs/BACKUP.md). UI-free: the stores, settings and photo file access are
 * injected, so this runs the same in jest and on the phone. No network, no account.
 */
import type { Collection, StoredRecord } from '@/storage/kv';
import { DEFAULT_SETTINGS, type AppSettings } from '@/types/recipe';

import {
  BACKUP_COLLECTIONS,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type Backup,
  type BackupCollection,
  type BackupPhoto,
  type BackupRecord,
} from './format';

export type BackupCollections = Record<BackupCollection, Collection<StoredRecord>>;

/** Recipe photo files (expo-file-system on the phone, a Map in tests). */
export interface PhotoStore {
  /** Is this photo URI one of the app's own photo files (not a web URL)? */
  isLocal(uri: string): boolean;
  /** base64 of a local photo, or undefined when the file is gone. */
  read(uri: string): Promise<string | undefined>;
  /** Write a photo into the app's photo folder; returns its new URI. */
  write(name: string, base64: string): Promise<string>;
}

export interface SettingsAccess {
  get(): Promise<AppSettings>;
  update(patch: Partial<AppSettings>): Promise<unknown>;
}

export interface BackupDeps {
  collections: BackupCollections;
  settings: SettingsAccess;
  photos: PhotoStore;
  appVersion?: string;
  now?: () => Date;
}

export type RestoreMode = 'merge' | 'replace';

export interface RestoreResult {
  added: number;
  updated: number;
  /** Merge: records skipped because this phone's copy is newer. */
  kept: number;
  /** Replace: records on this phone that were removed. */
  removed: number;
  photos: number;
  settings: boolean;
}

/** Sync/account fields never travel in a backup: the new phone's account adopts the data on its next sync. */
function portable(rec: StoredRecord): BackupRecord {
  const { householdId: _h, createdBy: _c, deletedAt: _d, ...rest } = rec as StoredRecord & Record<string, unknown>;
  return rest as BackupRecord;
}

/** Collect everything into one Backup object (serialize with JSON.stringify). Deleted records are left out. */
export async function createBackup({ collections, settings, photos, appVersion, now = () => new Date() }: BackupDeps): Promise<Backup> {
  const data = {} as Backup['data'];
  for (const name of BACKUP_COLLECTIONS) {
    data[name] = (await collections[name].all()).map(portable);
  }
  const photoFiles: Record<string, BackupPhoto> = {};
  for (const recipe of data.recipes) {
    const uri = typeof recipe.photoUri === 'string' ? recipe.photoUri : undefined;
    if (!uri || !photos.isLocal(uri)) continue;
    const base64 = await photos.read(uri);
    if (base64) photoFiles[recipe.id] = { name: uri.split('/').pop() || `${recipe.id}.jpg`, base64 };
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now().toISOString(),
    appVersion,
    data,
    settings: { ...(await settings.get()) },
    photos: photoFiles,
  };
}

/** Only known settings keys are restored (unknown keys from other versions are ignored). */
function knownSettings(raw: Record<string, unknown>): Partial<AppSettings> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) if (key in raw) out[key] = raw[key];
  return out as Partial<AppSettings>;
}

/**
 * Restore a parsed backup.
 * - merge: adds records this phone doesn't have; for the same record, the newer copy (updatedAt) wins.
 * - replace: removes this phone's records that aren't in the backup (tombstones, so a signed-in account syncs
 *   the removal too), then writes every backup record. Settings are restored in both modes when present.
 * Writes go through the stores (`save`), so they are stamped with the current account and sync if signed in.
 */
export async function restoreBackup(
  backup: Backup,
  mode: RestoreMode,
  { collections, settings, photos, now = () => new Date() }: BackupDeps,
): Promise<RestoreResult> {
  const result: RestoreResult = { added: 0, updated: 0, kept: 0, removed: 0, photos: 0, settings: false };
  // Photos first, so restored recipes point at files that exist on this phone.
  const photoUris = new Map<string, string>();
  for (const [recipeId, file] of Object.entries(backup.photos)) {
    try {
      photoUris.set(recipeId, await photos.write(file.name, file.base64));
      result.photos += 1;
    } catch {
      // A bad photo never blocks the recipes.
    }
  }
  // Merge: a category this phone already has under the same name (e.g. the default Breakfast / Lunch / Dinner a
  // fresh install seeds) is reused instead of duplicated; restored recipes point at the local id.
  const categoryIds = new Map<string, string>();
  for (const name of BACKUP_COLLECTIONS) {
    const col = collections[name];
    let incoming = backup.data[name];
    if (name === 'categories' && mode === 'merge') {
      const byName = new Map((await col.all()).map((c) => [String((c as { name?: unknown }).name ?? '').trim().toLowerCase(), c.id]));
      incoming = incoming.filter((c) => {
        const localId = byName.get(String(c.name ?? '').trim().toLowerCase());
        if (localId && localId !== c.id) {
          categoryIds.set(c.id, localId);
          result.kept += 1;
          return false;
        }
        return true;
      });
    }
    if (name === 'recipes' && categoryIds.size) {
      incoming = incoming.map((r) =>
        Array.isArray(r.categoryIds)
          ? { ...r, categoryIds: [...new Set((r.categoryIds as unknown[]).map((id) => categoryIds.get(String(id)) ?? String(id)))] }
          : r,
      );
    }
    const local = new Map((await col.all()).map((r) => [r.id, r]));
    if (mode === 'replace') {
      const keep = new Set(incoming.map((r) => r.id));
      for (const id of local.keys()) {
        if (!keep.has(id)) {
          await col.remove(id, now());
          result.removed += 1;
        }
      }
    }
    for (const rec of incoming) {
      const existing = local.get(rec.id);
      if (mode === 'merge' && existing && (existing.updatedAt ?? '') >= (rec.updatedAt ?? '')) {
        result.kept += 1;
        continue;
      }
      let next: StoredRecord & Record<string, unknown> = { ...rec };
      if (name === 'recipes') {
        const restored = photoUris.get(rec.id);
        if (restored) next = { ...next, photoUri: restored };
        else if (typeof next.photoUri === 'string' && photos.isLocal(next.photoUri)) delete next.photoUri; // file not in backup
      }
      // Keep this phone's sync stamps for a record it already has; new records get the current account's.
      if (existing) next = { ...next, householdId: existing.householdId, createdBy: existing.createdBy };
      await col.save(next, now());
      if (existing) result.updated += 1;
      else result.added += 1;
    }
  }
  if (backup.settings) {
    await settings.update(knownSettings(backup.settings));
    result.settings = true;
  }
  return result;
}
