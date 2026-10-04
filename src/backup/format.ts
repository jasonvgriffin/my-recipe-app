/**
 * Backup & restore file format (v1.0.6, docs/BACKUP.md). One self-contained, versioned JSON document with every
 * on-device collection, settings and the recipe photos (base64). Works offline, no account. UI-free and
 * runtime-neutral (jest, Hermes).
 *
 * v1.0.7: exports are a standard ZIP (`My-Recipe-App-backup-YYYY-MM-DD.zip`, application/zip) holding that JSON as
 * `backup.json` — Google Drive and other share targets accept it (the bare `.myrecipe` JSON failed to save to Drive).
 * Import accepts both the new .zip and old .myrecipe (plain JSON) files.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { z } from 'zod';

export const BACKUP_FORMAT = 'my-recipe-app-backup';
/** Bump when the shape changes; `parseBackup` upgrades older versions and rejects newer ones. */
export const BACKUP_VERSION = 1;
export const BACKUP_EXTENSION = 'zip';
export const BACKUP_MIME = 'application/zip';
/** v1.0.6 backups: plain JSON files named *.myrecipe (still importable). */
export const LEGACY_BACKUP_EXTENSION = 'myrecipe';
/** The JSON document's name inside the ZIP. */
export const BACKUP_ZIP_ENTRY = 'backup.json';
/** MIME types the restore picker allows: the .zip, old .myrecipe (JSON / unknown binary), and anything else as a fallback. */
export const BACKUP_PICKER_MIME_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/json',
  'application/octet-stream',
  '*/*',
];
/** Refuse absurd files before JSON.parse (photos make backups big, but not this big). */
export const MAX_BACKUP_BYTES = 150 * 1024 * 1024;

/** Every collection in a backup, keyed like the synced tables (docs/SYNC.md). */
export const BACKUP_COLLECTIONS = [
  'categories',
  'recipes',
  'pantry_items',
  'meal_plan_entries',
  'shopping_items',
  'barcode_items',
] as const;
export type BackupCollection = (typeof BACKUP_COLLECTIONS)[number];

const record = z.looseObject({ id: z.string().min(1).max(200), updatedAt: z.string().optional() });
export type BackupRecord = z.infer<typeof record>;

const photo = z.object({
  /** File name inside the photo folder, e.g. `<recipeId>.jpg`. */
  name: z.string().min(1).max(200),
  base64: z.string().min(1),
});
export type BackupPhoto = z.infer<typeof photo>;

const recordList = z.array(record).max(100_000).default([]);

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().min(1),
  exportedAt: z.string(),
  appVersion: z.string().optional(),
  data: z.object({
    categories: recordList,
    recipes: recordList,
    pantry_items: recordList,
    meal_plan_entries: recordList,
    shopping_items: recordList,
    barcode_items: recordList,
  }),
  /** Device settings + appearance (unit system, optional features, theme, accent, …). */
  settings: z.record(z.string(), z.unknown()).optional(),
  /** Recipe photos by recipe id. */
  photos: z.record(z.string(), photo).default({}),
});
export type Backup = z.infer<typeof backupSchema>;

export interface BackupSummary {
  exportedAt: string;
  appVersion?: string;
  recipes: number;
  categories: number;
  photos: number;
  mealPlanEntries: number;
  shoppingItems: number;
  pantryItems: number;
  barcodeItems: number;
  hasSettings: boolean;
}

export function summarizeBackup(b: Backup): BackupSummary {
  return {
    exportedAt: b.exportedAt,
    appVersion: b.appVersion,
    recipes: b.data.recipes.length,
    categories: b.data.categories.length,
    photos: Object.keys(b.photos).length,
    mealPlanEntries: b.data.meal_plan_entries.length,
    shoppingItems: b.data.shopping_items.length,
    pantryItems: b.data.pantry_items.length,
    barcodeItems: b.data.barcode_items.length,
    hasSettings: !!b.settings,
  };
}

export type ParseResult = { ok: true; backup: Backup; summary: BackupSummary } | { ok: false; error: string };

/** Validate a backup file's text. Never throws; errors are short, user-facing sentences. */
export function parseBackup(text: string): ParseResult {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'This file is too large to be a My Recipe App backup.' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This is not a My Recipe App backup file.' };
  }
  const head = raw as { format?: unknown; version?: unknown } | null;
  if (!head || typeof head !== 'object' || head.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'This is not a My Recipe App backup file.' };
  }
  if (typeof head.version === 'number' && head.version > BACKUP_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of My Recipe App. Update the app, then try again.' };
  }
  const parsed = backupSchema.safeParse(upgrade(raw as Record<string, unknown>));
  if (!parsed.success) return { ok: false, error: 'This backup file is damaged or incomplete.' };
  return { ok: true, backup: parsed.data, summary: summarizeBackup(parsed.data) };
}

/** Schema upgrades between versions go here (v1 is the first). */
function upgrade(raw: Record<string, unknown>): Record<string, unknown> {
  return raw;
}

/** v1.0.7: the backup as a ZIP archive with one entry, `backup.json`. */
export function encodeBackupZip(backup: Backup): Uint8Array {
  const mtime = new Date(backup.exportedAt);
  return zipSync({ [BACKUP_ZIP_ENTRY]: [strToU8(JSON.stringify(backup)), { level: 6, mtime: isNaN(+mtime) ? new Date() : mtime }] });
}

const isZip = (bytes: Uint8Array) => bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

/**
 * Validate a backup file's bytes: a v1.0.7 .zip (reads `backup.json`, or the only .json / .myrecipe entry) or a
 * v1.0.6 .myrecipe JSON file. Never throws.
 */
export function parseBackupFile(bytes: Uint8Array): ParseResult {
  if (bytes.length > MAX_BACKUP_BYTES) return { ok: false, error: 'This file is too large to be a My Recipe App backup.' };
  if (!isZip(bytes)) {
    try {
      return parseBackup(strFromU8(bytes));
    } catch {
      return { ok: false, error: 'This is not a My Recipe App backup file.' };
    }
  }
  let entries: Record<string, Uint8Array>;
  try {
    let total = 0;
    entries = unzipSync(bytes, {
      filter: (f) => {
        const wanted = /(^|\/)backup\.json$/i.test(f.name) || /\.(json|myrecipe)$/i.test(f.name);
        if (wanted) total += f.originalSize;
        return wanted && total <= MAX_BACKUP_BYTES;
      },
    });
  } catch {
    return { ok: false, error: 'This backup file is damaged or incomplete.' };
  }
  const names = Object.keys(entries);
  const name = names.find((n) => /(^|\/)backup\.json$/i.test(n)) ?? (names.length === 1 ? names[0] : undefined);
  if (!name) return { ok: false, error: 'This is not a My Recipe App backup file.' };
  try {
    return parseBackup(strFromU8(entries[name]));
  } catch {
    return { ok: false, error: 'This backup file is damaged or incomplete.' };
  }
}

export function backupFileName(now: Date): string {
  const d = now.toISOString().slice(0, 10);
  return `My-Recipe-App-backup-${d}.${BACKUP_EXTENSION}`;
}
