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
/** Persisted pull/push cursors for one household, or for a user's personal space (no household). */
export function syncCursorStorageKey(householdId: string | undefined, userId?: string): string {
  return householdId ? `my-recipe-app/sync-cursors/${householdId}` : `my-recipe-app/sync-cursors/personal/${userId ?? ''}`;
}

/**
 * The feature gate a sync scope needs: household sharing for a household, personal cloud sync otherwise.
 * The two are independent (v1.0.6): personal sync + MCP never depend on householdSync.
 */
export function syncFeatureFor(householdId: string | undefined | null): 'householdSync' | 'cloudSync' {
  return householdId ? 'householdSync' : 'cloudSync';
}

/** Is a local record part of this sync scope? Personal scope = no household, authored by this user (or nobody). */
export function inSyncScope(rec: { householdId?: string; createdBy?: string }, householdId: string | undefined, userId: string): boolean {
  if (householdId) return rec.householdId === householdId;
  return !rec.householdId && (!rec.createdBy || rec.createdBy === userId);
}
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
  /** Household to sync with; undefined/null = the user's personal space (v1.0.6). */
  householdId?: string | null;
  userId: string;
  now?: () => Date;
  /**
   * Feature gate (paywall-ready). Household scope needs `householdSync`, personal scope `cloudSync`; without it
   * the engine is a no-op (local data untouched).
   */
  canUse?: CanUse;
}

/**
 * Offline-first, last-write-wins sync (spec #25, docs/SYNC.md). For each table:
 *   1. adopt: local-only records (no householdId, e.g. created while signed out) are stamped with the
 *      household + author so they get uploaded (personal scope: author only; they stay householdId-less);
 *   2. push: local changes (incl. tombstones) since the push cursor;
 *   3. pull: remote changes since the pull cursor, merged LWW by updatedAt;
 *   4. purge local tombstones older than TOMBSTONE_TTL_DAYS.
 * The app never blocks on this; call it on sign-in, app foreground, after writes (debounced), or on realtime events.
 */
export function createSyncEngine({
  collections,
  remote,
  kv,
  householdId: householdOrNull,
  userId,
  now = () => new Date(),
  canUse = defaultCanUse,
}: SyncEngineDeps) {
  const householdId = householdOrNull || undefined;
  const cursorKey = syncCursorStorageKey(householdId, userId);
  async function loadCursors(): Promise<Cursors> {
    try {
      const raw = await kv.getItem(cursorKey);
      return raw ? (JSON.parse(raw) as Cursors) : { pulled: {}, pushed: {} };
    } catch {
      return { pulled: {}, pushed: {} };
    }
  }

  async function syncOnce(): Promise<SyncResult> {
    if (!canUse(syncFeatureFor(householdId))) {
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

      // 1. adopt local-only records into the household (or claim unauthored ones for the personal space)
      for (const rec of await col.allRaw()) {
        if (householdId && !rec.householdId) {
          await col.save({ ...rec, householdId, createdBy: rec.createdBy ?? userId }, now());
        } else if (!householdId && !rec.householdId && !rec.createdBy) {
          await col.save({ ...rec, createdBy: userId }, now());
        }
      }

      // 2. push
      const outgoing = (await col.changesSince(cursors.pushed[table])).filter((r) => inSyncScope(r, householdId, userId));
      if (outgoing.length) {
        await remote.push(table, outgoing);
        cursors.pushed[table] = outgoing
          .map((r) => r.updatedAt ?? '')
          .sort()
          .pop();
      }
      result.pushed[table] = outgoing.length;

      // 3. pull
      const incoming = await remote.pull(table, householdId ?? null, cursors.pulled[table]);
      result.pulled[table] = await col.applyRemote(incoming);
      const maxPulled = incoming
        .map((r) => r.updatedAt ?? '')
        .sort()
        .pop();
      if (maxPulled) cursors.pulled[table] = maxPulled;

      // 4. purge old tombstones
      const cutoff = new Date(now().getTime() - TOMBSTONE_TTL_DAYS * 86_400_000).toISOString();
      await col.purgeTombstones(cutoff);

      await kv.setItem(cursorKey, JSON.stringify(cursors));
    }
    return result;
  }

  return { syncOnce };
}
