import { canUse as defaultCanUse, type CanUse } from '@/entitlements';
import type { KeyValueStore } from '@/storage/kv';
import type { SyncTable } from '@/types/sync';

import type { RemoteAdapter, SyncCollections, SyncResult } from './types';

export const SYNC_TABLES: SyncTable[] = [
  'categories',
  'recipes',
  'pantry_items',
  'meal_plan_entries',
  'shopping_items',
  'barcode_items',
];
const CURSOR_KEY = (householdId: string) => `my-recipe-app/sync-cursors/${householdId}`;
/** Tombstones are kept this long after a successful sync, then purged locally. */
export const TOMBSTONE_TTL_DAYS = 30;

interface Cursors {
  /** Highest remote updatedAt seen per table. */
  pulled: Partial<Record<SyncTable, string>>;
  /** Local updatedAt high-water mark already pushed per table. */
  pushed: Partial<Record<SyncTable, string>>;
}

export interface SyncEngineDeps {
  collections: SyncCollections;
  remote: RemoteAdapter;
  /** Where sync cursors are persisted. */
  kv: KeyValueStore;
  householdId: string;
  userId: string;
  now?: () => Date;
  /** Feature gate (paywall-ready). Without `householdSync` the engine is a no-op (local data untouched). */
  canUse?: CanUse;
}

/**
 * Offline-first, last-write-wins sync (spec #25, docs/SYNC.md). For each table:
 *   1. adopt: local-only records (no householdId, e.g. created while signed out) are stamped with the
 *      household + author so they get uploaded;
 *   2. push: local changes (incl. tombstones) since the push cursor;
 *   3. pull: remote changes since the pull cursor, merged LWW by updatedAt;
 *   4. purge local tombstones older than TOMBSTONE_TTL_DAYS.
 * The app never blocks on this; call it on sign-in, app foreground, after writes (debounced), or on realtime events.
 */
export function createSyncEngine({
  collections,
  remote,
  kv,
  householdId,
  userId,
  now = () => new Date(),
  canUse = defaultCanUse,
}: SyncEngineDeps) {
  async function loadCursors(): Promise<Cursors> {
    try {
      const raw = await kv.getItem(CURSOR_KEY(householdId));
      return raw ? (JSON.parse(raw) as Cursors) : { pulled: {}, pushed: {} };
    } catch {
      return { pulled: {}, pushed: {} };
    }
  }

  async function syncOnce(): Promise<SyncResult> {
    if (!canUse('householdSync')) {
      const zero = Object.fromEntries(SYNC_TABLES.map((t) => [t, 0])) as SyncResult['pushed'];
      return { pushed: zero, pulled: { ...zero }, skipped: 'feature_locked' };
    }
    const cursors = await loadCursors();
    const result: SyncResult = {
      pushed: {} as SyncResult['pushed'],
      pulled: {} as SyncResult['pulled'],
    };
    for (const table of SYNC_TABLES) {
      const col = collections[table];

      // 1. adopt local-only records into the household
      for (const rec of await col.allRaw()) {
        if (!rec.householdId) {
          await col.save({ ...rec, householdId, createdBy: rec.createdBy ?? userId }, now());
        }
      }

      // 2. push
      const outgoing = (await col.changesSince(cursors.pushed[table])).filter((r) => r.householdId === householdId);
      if (outgoing.length) {
        await remote.push(table, outgoing);
        cursors.pushed[table] = outgoing
          .map((r) => r.updatedAt ?? '')
          .sort()
          .pop();
      }
      result.pushed[table] = outgoing.length;

      // 3. pull
      const incoming = await remote.pull(table, householdId, cursors.pulled[table]);
      result.pulled[table] = await col.applyRemote(incoming);
      const maxPulled = incoming
        .map((r) => r.updatedAt ?? '')
        .sort()
        .pop();
      if (maxPulled) cursors.pulled[table] = maxPulled;

      // 4. purge old tombstones
      const cutoff = new Date(now().getTime() - TOMBSTONE_TTL_DAYS * 86_400_000).toISOString();
      await col.purgeTombstones(cutoff);

      await kv.setItem(CURSOR_KEY(householdId), JSON.stringify(cursors));
    }
    return result;
  }

  return { syncOnce };
}
