/**
 * Sync metadata carried by every synced record (spec #25, docs/SYNC.md).
 * Local-first: records work fully offline with createdBy unset. When the user signs in, the sync engine stamps
 * createdBy and uploads them to their personal space. (Household sharing was removed in v1.0.6.)
 */
export interface SyncMeta {
  /** Stable UUID v4 (same id locally and in Supabase). */
  id: string;
  /** Legacy: set by the household sharing feature removed in v1.0.6. The next sync drops it. */
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
  | 'barcode_items';
