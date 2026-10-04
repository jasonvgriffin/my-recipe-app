/**
 * Backup & restore file format (v1.0.6, docs/BACKUP.md). One self-contained, versioned JSON file
 * (`My-Recipe-App-backup-YYYY-MM-DD.myrecipe`) with every on-device collection, settings and the recipe photos
 * (base64). Works offline, no account. UI-free and runtime-neutral (jest, Hermes).
 */
import { z } from 'zod';

export const BACKUP_FORMAT = 'my-recipe-app-backup';
/** Bump when the shape changes; `parseBackup` upgrades older versions and rejects newer ones. */
export const BACKUP_VERSION = 1;
export const BACKUP_EXTENSION = 'myrecipe';
export const BACKUP_MIME = 'application/json';
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

export function backupFileName(now: Date): string {
  const d = now.toISOString().slice(0, 10);
  return `My-Recipe-App-backup-${d}.${BACKUP_EXTENSION}`;
}
