import type { Collection, StoredRecord } from '@/storage/kv';
import type { SyncTable } from '@/types/sync';

/**
 * A remote backend for sync (spec #25). Supabase implements it in ./supabase.ts; tests use an in-memory fake.
 * Works in APP records (camelCase); the adapter maps to/from database rows.
 */
export interface RemoteAdapter {
  /**
   * Records of the household changed after `sinceIso` (incl. tombstones), ordered by updatedAt.
   * `householdId` null = the signed-in user's personal space (RLS: only their own rows).
   */
  pull(table: SyncTable, householdId: string | null, sinceIso: string | undefined): Promise<StoredRecord[]>;
  /** Upsert records (incl. tombstones). */
  push(table: SyncTable, records: StoredRecord[]): Promise<void>;
}

export type SyncCollections = Record<SyncTable, Collection<StoredRecord>>;

export interface SyncResult {
  pushed: Record<SyncTable, number>;
  pulled: Record<SyncTable, number>;
  /** Set when nothing ran because the scope's feature (householdSync / cloudSync) is gated off. */
  skipped?: 'feature_locked';
}

/** What a sync pass covers: a shared household, or (no householdId) the user's personal space. */
export interface SyncScope {
  userId: string;
  householdId?: string;
}
