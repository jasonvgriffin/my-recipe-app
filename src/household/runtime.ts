import { canUse } from '@/entitlements';
import { getIdentity, setIdentity } from '@/storage/identity';
import { defaultStore } from '@/storage/kv';
import { onDataChange, withoutSyncNotify } from '@/storage/writes';
import {
  appSyncCollections,
  createAccountController,
  createSupabase,
  createSupabaseAccount,
  createSupabaseRemote,
  createSyncCoordinator,
  getSupabaseConfig,
  subscribeHouseholdRealtime,
  type AccountBackend,
  type AccountController,
  type SyncCoordinator,
  type SyncReason,
  type SyncSchedule,
} from '@/sync';
import type { RemoteAdapter, SyncScope } from '@/sync/types';

import { setHouseholdSnapshot } from './state';

export interface HouseholdRuntimeOptions {
  account: AccountBackend | null;
  remote: RemoteAdapter | null;
  schedule?: SyncSchedule;
  /** Optional realtime for the active scope (household, or the user's personal space when householdId is unset). */
  realtime?: (scope: SyncScope, onChange: () => void) => () => void;
}

let account: AccountController = createAccountController({
  kv: defaultStore,
  backend: null,
  setIdentity,
  canUse: (id) => canUse(id),
});
let coordinator: SyncCoordinator = createSyncCoordinator({
  collections: appSyncCollections(),
  getRemote: () => null,
  getIdentity,
  kv: defaultStore,
  canUse: (id) => canUse(id),
});
let unsubData: (() => void) | null = null;
let unsubAccount: (() => void) | null = null;
let unsubCoord: (() => void) | null = null;
let lastKey = '';
let realtimeFactory: HouseholdRuntimeOptions['realtime'] = undefined;
let liveStarted = false;
let magicLinks = new Map<string, Promise<{ ok: boolean; error?: string }>>();

function refreshSnapshot(): void {
  setHouseholdSnapshot({ account: account.getState(), sync: coordinator.getStatus() });
}

function bind(): void {
  unsubData?.();
  unsubAccount?.();
  unsubCoord?.();
  unsubData = onDataChange((source) => {
    if (source === 'local') coordinator.requestSync('write');
  });
  unsubAccount = account.subscribe((next) => {
    const key = `${next.user?.id ?? ''}|${next.household?.id ?? ''}`;
    if (key !== lastKey) {
      lastKey = key;
      // v1.0.6: any signed-in user syncs — their household if they have one, else their personal space.
      const user = next.user;
      const scope: SyncScope | undefined = user ? { userId: user.id, householdId: next.household?.id } : undefined;
      if (scope && realtimeFactory) {
        const start = realtimeFactory;
        coordinator.setRealtime((onChange) => start(scope, onChange));
      } else {
        coordinator.setRealtime(null);
      }
      if (user) coordinator.requestSync('signin');
      else coordinator.enterSolo();
    }
    refreshSnapshot();
  });
  unsubCoord = coordinator.subscribe(() => refreshSnapshot());
}

function install(options: HouseholdRuntimeOptions): void {
  coordinator.stop();
  magicLinks = new Map();
  lastKey = '';
  realtimeFactory = options.realtime;
  account = createAccountController({
    kv: defaultStore,
    backend: options.account,
    setIdentity,
    canUse: (id) => canUse(id),
  });
  const remote = options.remote;
  coordinator = createSyncCoordinator({
    collections: appSyncCollections(),
    getRemote: () => remote,
    getIdentity,
    kv: defaultStore,
    canUse: (id) => canUse(id),
    schedule: options.schedule,
    isolate: withoutSyncNotify,
  });
  bind();
  refreshSnapshot();
}

bind();
refreshSnapshot();

/** Start background sync. In tests this is a no-op — call `resetHouseholdRuntime` with a fake backend. */
export function startHouseholdRuntime(): void {
  if (process.env.NODE_ENV === 'test') return;
  if (liveStarted) return;
  liveStarted = true;
  const config = getSupabaseConfig();
  if (!config) {
    install({ account: null, remote: null });
    void account.restore();
    return;
  }
  const client = createSupabase(config);
  install({
    account: createSupabaseAccount(client),
    remote: createSupabaseRemote(client),
    realtime: (scope, onChange) => subscribeHouseholdRealtime(client, scope, onChange),
  });
  void account.restore();
}

/** Test hook: swap in a fake account backend and remote. Restores the session before resolving. */
export async function resetHouseholdRuntime(options: HouseholdRuntimeOptions): Promise<void> {
  liveStarted = true;
  install(options);
  await account.restore();
}

/** Drop a test backend and return to the signed-out, offline runtime (no network). */
export function stopHouseholdRuntime(): void {
  magicLinks = new Map();
  unsubData?.();
  unsubAccount?.();
  unsubCoord?.();
  coordinator.stop();
  lastKey = '';
  realtimeFactory = undefined;
  setIdentity({});
  account = createAccountController({
    kv: defaultStore,
    backend: null,
    setIdentity,
    canUse: (id) => canUse(id),
  });
  coordinator = createSyncCoordinator({
    collections: appSyncCollections(),
    getRemote: () => null,
    getIdentity,
    kv: defaultStore,
    canUse: (id) => canUse(id),
    isolate: withoutSyncNotify,
  });
  bind();
  refreshSnapshot();
}

export function restoreHouseholdSession(): Promise<void> {
  return account.restore();
}

export function requestHouseholdSync(reason: SyncReason): void {
  coordinator.requestSync(reason);
}

export function syncHouseholdNow(reason: SyncReason): Promise<unknown> {
  return coordinator.syncNow(reason);
}

/**
 * Finish a Supabase magic-link sign-in (`myrecipeapp://auth#access_token=…` or `?code=…`).
 * The app-wide URL listener and the `/auth` route both call this with the same URL; the first call
 * does the token exchange and later calls share its result (a PKCE code can only be exchanged once).
 */
export function completeMagicLink(url: string): Promise<{ ok: boolean; error?: string }> {
  const key = url.trim();
  const pending = magicLinks.get(key);
  if (pending) return pending;
  const next = account.completeMagicLink(key);
  magicLinks.set(key, next);
  return next;
}

/** Current signed-in user, if any (used by the `/auth` route to confirm a magic link worked). */
export function currentAccountUser() {
  return account.getState().user;
}

export function householdActions() {
  return {
    sendCode: (email: string) => account.sendCode(email),
    verifyCode: (email: string, token: string) => account.verifyCode(email, token),
    signOut: () => account.signOut(),
    createHousehold: (name: string) => account.createHousehold(name),
    joinWithCode: (code: string) => account.joinWithCode(code),
    rotateInvite: () => account.rotateInvite(),
    leave: () => account.leave(),
    removeMember: (userId: string) => account.removeMember(userId),
    setDisplayName: (name: string) => account.setDisplayName(name),
    selectHousehold: (id: string) => account.selectHousehold(id),
    refresh: () => account.refresh(),
  };
}
