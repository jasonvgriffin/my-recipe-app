/** Why a sync pass was requested (docs/SYNC.md). */
export type SyncReason = 'signin' | 'join' | 'foreground' | 'write' | 'pull' | 'realtime' | 'retry';

export type SyncPhase = 'solo' | 'pending' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  /** Local changes not yet confirmed uploaded. */
  pending: number;
  lastSyncedAt?: string;
  lastError?: string;
  /** True while a Supabase realtime subscription is active (optional). */
  realtime: boolean;
}

export const SOLO_STATUS: SyncStatus = { phase: 'solo', pending: 0, realtime: false };

/** One line for the sync indicator. Offline copy never blocks the rest of the app. */
export function syncStatusLabel(status: SyncStatus): string {
  switch (status.phase) {
    case 'solo':
      return 'On this device only';
    case 'pending':
      return status.pending === 1 ? '1 change waiting to sync' : `${status.pending} changes waiting to sync`;
    case 'syncing':
      return 'Syncing…';
    case 'synced':
      return 'Synced';
    case 'offline':
      return status.pending > 0
        ? `Offline — ${status.pending} ${status.pending === 1 ? 'change' : 'changes'} waiting to sync`
        : 'Offline — changes will sync when you are back online';
    case 'error':
      return status.lastError ? `Sync problem: ${status.lastError}` : 'Sync problem';
  }
}
