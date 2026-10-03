/**
 * Household / sync metadata carried by every synced record (spec #25, docs/SYNC.md).
 * Local-first: records work fully offline with householdId/createdBy unset (solo mode). When the user
 * signs in and joins a household, the sync engine stamps householdId on local records and uploads them.
 */
export interface SyncMeta {
  /** Stable UUID v4 (same id locally and in Supabase). */
  id: string;
  /** Household the record belongs to; undefined = local-only (solo / not signed in). */
  householdId?: string;
  /** Supabase auth user id of the author; undefined when created while signed out. */
  createdBy?: string;
  /** ISO-8601. */
  createdAt: string;
  /** ISO-8601; bumped on every local write. Last-write-wins key for sync. */
  updatedAt: string;
  /** ISO-8601 soft-delete tombstone. Deleted records are hidden but kept until synced + purged. */
  deletedAt?: string;
}

/** Names of the synced tables (match supabase/migrations). */
export type SyncTable =
  | 'recipes'
  | 'categories'
  | 'pantry_items'
  | 'meal_plan_entries'
  | 'shopping_items'
  | 'barcode_items'
  | 'receipt_aliases';
