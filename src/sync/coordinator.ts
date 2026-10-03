import { canUse as defaultCanUse, type CanUse } from '@/entitlements';
import type { KeyValueStore } from '@/storage/kv';
import type { SyncTable } from '@/types/sync';

import { createSyncEngine, SYNC_TABLES, syncCursorStorageKey } from './engine';
import { syncErrorMessage, isOfflineError } from './errors';
import type { SyncReason, SyncStatus } from './status';
import { SOLO_STATUS } from './status';
import type { RemoteAdapter, SyncCollections } from './types';

const QUEUE_KEY = 'my-recipe-app/sync-queue/v1';

interface QueueFile {
  householdId?: string;
  dirty: boolean;
  attempts: number;
  lastError?: string;
  lastSyncedAt?: string;
}

interface Cursors {
  pushed?: Partial<Record<SyncTable, string>>;
}

export interface SyncSchedule {
  (fn: () => void, ms: number): { cancel: () => void };
}

export interface SyncCoordinatorDeps {
  collections: SyncCollections;
  getRemote: () => RemoteAdapter | null;
  getIdentity: () => { userId?: string; householdId?: string };
  kv: KeyValueStore;
  now?: () => Date;
  canUse?: CanUse;
  /** Debounce for local writes (ms). Default 1500. */
  debounceMs?: number;
  /** Debounce for realtime bursts (ms). Default 400. */
  realtimeDebounceMs?: number;
  /** Base delay before an offline retry. Grows with attempts, capped at 30s. */
  retryBaseMs?: number;
  schedule?: SyncSchedule;
  /** Wraps the engine so its writes are not treated as new local edits. */
  isolate?: <T>(fn: () => Promise<T>) => Promise<T>;
}

const defaultSchedule: SyncSchedule = (fn, ms) => {
  const handle = setTimeout(fn, ms);
  return { cancel: () => clearTimeout(handle) };
};

/**
 * When sync runs (docs/SYNC.md + pull-to-refresh): sign-in / join, app foreground, debounced local
 * writes, pull-to-refresh, optional realtime, and a retry after an offline failure.
 * The on-device store is the queue: a failed push leaves cursors unmoved so the next pass uploads them.
 */
export function createSyncCoordinator({
  collections,
  getRemote,
  getIdentity,
  kv,
  now = () => new Date(),
  canUse = defaultCanUse,
  debounceMs = 1500,
  realtimeDebounceMs = 400,
  retryBaseMs = 5000,
  schedule = defaultSchedule,
  isolate = (fn) => fn(),
}: SyncCoordinatorDeps) {
  let status: SyncStatus = { ...SOLO_STATUS };
  let stopped = false;
  let running = false;
  let queuedReason: SyncReason | undefined;
  /** Bumped when a pass starts so a stale "pending" update cannot overwrite a finished one. */
  let epoch = 0;
  let timer: { cancel: () => void } | null = null;
  let retryTimer: { cancel: () => void } | null = null;
  let unsubRealtime: (() => void) | null = null;
  const listeners = new Set<(next: SyncStatus) => void>();

  function emit(): void {
    for (const listener of listeners) listener(status);
  }

  async function loadQueue(): Promise<QueueFile> {
    try {
      const raw = await kv.getItem(QUEUE_KEY);
      return raw ? (JSON.parse(raw) as QueueFile) : { dirty: false, attempts: 0 };
    } catch {
      return { dirty: false, attempts: 0 };
    }
  }

  async function saveQueue(queue: QueueFile): Promise<void> {
    await kv.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  async function countPending(householdId: string): Promise<number> {
    let cursors: Cursors = {};
    try {
      const raw = await kv.getItem(syncCursorStorageKey(householdId));
      cursors = raw ? (JSON.parse(raw) as Cursors) : {};
    } catch {
      cursors = {};
    }
    let pending = 0;
    for (const table of SYNC_TABLES) {
      const changes = await collections[table].changesSince(cursors.pushed?.[table]);
      pending += changes.filter((row) => !row.householdId || row.householdId === householdId).length;
    }
    return pending;
  }

  function active(): { userId: string; householdId: string; remote: RemoteAdapter } | null {
    if (stopped || !canUse('householdSync')) return null;
    const remote = getRemote();
    const identity = getIdentity();
    if (!remote || !identity.userId || !identity.householdId) return null;
    return { userId: identity.userId, householdId: identity.householdId, remote };
  }

  function enterSolo(): void {
    timer?.cancel();
    retryTimer?.cancel();
    timer = null;
    retryTimer = null;
    unsubRealtime?.();
    unsubRealtime = null;
    if (status.phase === 'solo' && !status.realtime && status.pending === 0 && !status.lastError) return;
    status = { ...SOLO_STATUS };
    emit();
  }

  function armRetry(attempts: number): void {
    retryTimer?.cancel();
    const delay = Math.min(30_000, retryBaseMs * Math.max(1, attempts));
    retryTimer = schedule(() => {
      void syncNow('retry');
    }, delay);
  }

  async function syncNow(reason: SyncReason): Promise<SyncStatus> {
    void reason;
    const ctx = active();
    if (!ctx) {
      enterSolo();
      return status;
    }
    if (running) {
      queuedReason = reason;
      return status;
    }
    running = true;
    epoch += 1;
    retryTimer?.cancel();
    retryTimer = null;
    status = { ...status, phase: 'syncing', lastError: undefined };
    emit();
    let locked = false;
    try {
      const engine = createSyncEngine({
        collections,
        remote: ctx.remote,
        kv,
        householdId: ctx.householdId,
        userId: ctx.userId,
        now,
        canUse,
      });
      const result = await isolate(() => engine.syncOnce());
      if (result.skipped === 'feature_locked') {
        locked = true;
      } else {
        const pending = await countPending(ctx.householdId);
        const lastSyncedAt = now().toISOString();
        await saveQueue({ householdId: ctx.householdId, dirty: pending > 0, attempts: 0, lastSyncedAt });
        if (pending > 0) {
          status = { phase: 'pending', pending, lastSyncedAt, realtime: status.realtime };
          timer?.cancel();
          timer = schedule(() => {
            void syncNow('write');
          }, debounceMs);
        } else {
          status = { phase: 'synced', pending: 0, lastSyncedAt, realtime: status.realtime };
        }
      }
    } catch (error) {
      const offline = isOfflineError(error);
      const previous = await loadQueue();
      const attempts = (previous.attempts ?? 0) + 1;
      const pending = await countPending(ctx.householdId).catch(() => status.pending);
      const lastError = syncErrorMessage(error);
      await saveQueue({
        householdId: ctx.householdId,
        dirty: true,
        attempts,
        lastError,
        lastSyncedAt: status.lastSyncedAt,
      });
      status = {
        phase: offline ? 'offline' : 'error',
        pending,
        lastError,
        lastSyncedAt: status.lastSyncedAt,
        realtime: status.realtime,
      };
      if (offline) armRetry(attempts);
    } finally {
      const followUp = queuedReason;
      queuedReason = undefined;
      running = false;
      if (!locked) emit();
      if (followUp && !locked) void syncNow(followUp);
    }
    if (locked) enterSolo();
    return status;
  }

  function requestSync(reason: SyncReason): void {
    if (!active()) {
      enterSolo();
      return;
    }
    const delay = reason === 'write' ? debounceMs : reason === 'realtime' ? realtimeDebounceMs : 0;
    if (delay > 0) {
      timer?.cancel();
      timer = schedule(() => {
        void syncNow(reason);
      }, delay);
      const identity = getIdentity();
      const ticket = epoch;
      if (identity.householdId && status.phase !== 'syncing') {
        void countPending(identity.householdId).then((pending) => {
          if (ticket !== epoch || stopped || status.phase === 'syncing') return;
          status = { ...status, phase: 'pending', pending };
          emit();
        });
      }
      return;
    }
    void syncNow(reason);
  }

  return {
    getStatus: (): SyncStatus => status,
    subscribe(listener: (next: SyncStatus) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    requestSync,
    syncNow,
    /** Optional Supabase realtime. Failures are ignored — sync still runs on the other triggers. */
    setRealtime(start: ((onChange: () => void) => () => void) | null): void {
      unsubRealtime?.();
      unsubRealtime = null;
      let realtime = false;
      if (start && !stopped) {
        try {
          unsubRealtime = start(() => requestSync('realtime'));
          realtime = true;
        } catch {
          realtime = false;
        }
      }
      status = { ...status, realtime };
      emit();
    },
    enterSolo,
    stop(): void {
      stopped = true;
      timer?.cancel();
      retryTimer?.cancel();
      unsubRealtime?.();
      unsubRealtime = null;
    },
  };
}

export type SyncCoordinator = ReturnType<typeof createSyncCoordinator>;
