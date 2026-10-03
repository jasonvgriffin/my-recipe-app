import type { Collection, StoredRecord } from '@/storage/kv';
import type { SyncTable } from '@/types/sync';

/**
 * A remote backend for sync (spec #25). Supabase implements it in ./supabase.ts; tests use an in-memory fake.
 * Works in APP records (camelCase); the adapter maps to/from database rows.
 */
export interface RemoteAdapter {
  /** Records of the household changed after `sinceIso` (incl. tombstones), ordered by updatedAt. */
  pull(table: SyncTable, householdId: string, sinceIso: string | undefined): Promise<StoredRecord[]>;
  /** Upsert records (incl. tombstones). */
  push(table: SyncTable, records: StoredRecord[]): Promise<void>;
}

export type SyncCollections = Record<SyncTable, Collection<StoredRecord>>;

export interface SyncResult {
  pushed: Record<SyncTable, number>;
  pulled: Record<SyncTable, number>;
  /** Set when nothing ran because the householdSync feature is gated off. */
  skipped?: 'feature_locked';
}
