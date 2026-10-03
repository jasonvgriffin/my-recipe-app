/** Sync public API. See docs/SYNC.md. */
import type { Collection, StoredRecord } from '@/storage/kv';
import { mealPlanStore } from '@/storage/meal-plan';
import { pantryStore } from '@/storage/pantry';
import { barcodeItems } from '@/pantry';
import { recipeStore } from '@/storage/recipes';
import { receiptAliasStore } from '@/storage/receipt-aliases';

import type { SyncCollections } from './types';

export { createSyncEngine, SYNC_TABLES, TOMBSTONE_TTL_DAYS, syncCursorStorageKey } from './engine';
export { getSupabaseConfig, isSyncConfigured, type SupabaseConfig } from './config';
export type { RemoteAdapter, SyncCollections, SyncResult } from './types';
export {
  createAccountController,
  emptyAccountState,
  isEmail,
  normalizeOtp,
  AUTH_REDIRECT,
  HOUSEHOLD_SESSION_KEY,
  type AccountBackend,
  type AccountController,
  type AccountResult,
  type AccountState,
  type AccountUser,
  type HouseholdMember,
  type HouseholdSummary,
} from './account';
export { createSyncCoordinator, type SyncCoordinator, type SyncSchedule } from './coordinator';
export { authorLabel } from './authors';
export { readMagicLink, type MagicLinkParams } from './auth-url';
export { errorMessage, isOfflineError, syncErrorMessage } from './errors';
export { syncStatusLabel, SOLO_STATUS, type SyncPhase, type SyncReason, type SyncStatus } from './status';
export {
  createSupabase,
  createSupabaseAccount,
  createSupabaseRemote,
  sendEmailOtp,
  verifyEmailOtp,
  createHousehold,
  joinHousehold,
  subscribeHouseholdRealtime,
} from './supabase';

/** The app's on-device collections, keyed by Supabase table name. */
export function appSyncCollections(): SyncCollections {
  const c = <T extends StoredRecord>(col: Collection<T>) => col as unknown as Collection<StoredRecord>;
  return {
    recipes: c(recipeStore.collections.recipes),
    categories: c(recipeStore.collections.categories),
    pantry_items: c(pantryStore.collection),
    meal_plan_entries: c(mealPlanStore.collections.entries),
    shopping_items: c(mealPlanStore.collections.items),
    barcode_items: c(barcodeItems),
    receipt_aliases: c(receiptAliasStore.collection),
  };
}
