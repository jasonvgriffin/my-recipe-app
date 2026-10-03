import type { StoredRecord } from '@/storage/kv';
import type { SyncTable } from '@/types/sync';

/**
 * App record <-> Supabase row mapping. Each table has common sync columns, a few query columns, and the
 * full record body in `data jsonb` (so the app schema can evolve without DB migrations for every field).
 */
export interface DbRow {
  id: string;
  household_id: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  data: Record<string, unknown>;
  [extra: string]: unknown;
}

const EXTRA_COLUMNS: Record<SyncTable, Record<string, string>> = {
  recipes: { title: 'title' },
  categories: { name: 'name' },
  pantry_items: { name: 'name' },
  meal_plan_entries: { date: 'date', recipe_id: 'recipeId' },
  shopping_items: { week_start: 'weekStart', checked: 'checked' },
  barcode_items: { barcode: 'barcode', name: 'name' },
};

export function toRow(table: SyncTable, rec: StoredRecord & Record<string, unknown>): DbRow {
  const { id, householdId, createdBy, createdAt, updatedAt, deletedAt, ...data } = rec;
  const row: DbRow = {
    id,
    household_id: householdId as string,
    created_by: (createdBy as string | undefined) ?? null,
    created_at: (createdAt as string | undefined) ?? (updatedAt as string),
    updated_at: updatedAt as string,
    deleted_at: (deletedAt as string | undefined) ?? null,
    data,
  };
  for (const [col, field] of Object.entries(EXTRA_COLUMNS[table])) row[col] = rec[field] ?? null;
  return row;
}

export function fromRow(row: DbRow): StoredRecord & Record<string, unknown> {
  const rec: StoredRecord & Record<string, unknown> = {
    ...row.data,
    id: row.id,
    householdId: row.household_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (row.created_by) rec.createdBy = row.created_by;
  if (row.deleted_at) rec.deletedAt = row.deleted_at;
  return rec;
}
