import { emptyAccountState, type AccountState } from '@/sync/account';
import { SOLO_STATUS, type SyncStatus } from '@/sync/status';

/** What the Household screen and "Shared by" line render. Updated by the runtime; no Supabase import here. */
export interface HouseholdSnapshot {
  account: AccountState;
  sync: SyncStatus;
}

let snapshot: HouseholdSnapshot = { account: emptyAccountState(false), sync: { ...SOLO_STATUS } };
const listeners = new Set<() => void>();

export function getHouseholdSnapshot(): HouseholdSnapshot {
  return snapshot;
}

export function subscribeHouseholdRuntime(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setHouseholdSnapshot(next: HouseholdSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}
