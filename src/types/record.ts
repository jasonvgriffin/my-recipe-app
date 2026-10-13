/**
 * Fields on every stored record. Local-only since v1.0.6.
 * `householdId` and `createdBy` are leftover from household sharing. Backup & restore strips them.
 * They stay on the type so an old backup or an old on-device row still loads.
 */
export interface SyncMeta {
  /** Stable id (same id in storage and in a backup). */
  id: string;
  /** Legacy: set by household sharing, removed in v1.0.6. Ignored. */
  householdId?: string;
  /** Legacy author id from when the app signed in. Ignored. */
  createdBy?: string;
  /** ISO-8601. */
  createdAt: string;
  /** ISO-8601; bumped on every local write. Last-write-wins key for backup merge. */
  updatedAt: string;
  /** ISO-8601 soft-delete tombstone. Deleted records are hidden but kept. */
  deletedAt?: string;
}
