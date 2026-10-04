import { canUse as defaultCanUse, type CanUse } from '@/entitlements';
import type { KeyValueStore } from '@/storage/kv';

import { readMagicLink } from './auth-url';
import { errorMessage } from './errors';

/** Where Supabase sends the optional magic link. The in-app flow is the 6-digit code. */
export const AUTH_REDIRECT = 'myrecipeapp://auth';
export const HOUSEHOLD_SESSION_KEY = 'my-recipe-app/household-session/v1';

export interface AccountUser {
  id: string;
  email?: string;
}

export interface HouseholdSummary {
  id: string;
  name: string;
  inviteCode: string;
  createdBy: string;
}

export interface HouseholdMember {
  householdId: string;
  userId: string;
  role: 'owner' | 'member';
  displayName: string | null;
  joinedAt: string;
}

/**
 * Auth + household RPCs. Supabase implements this in supabase.ts; tests pass a fake.
 * No React imports — a future MCP server can reuse the controller.
 */
export interface AccountBackend {
  getSession(): Promise<AccountUser | null>;
  sendEmailOtp(email: string, redirectTo?: string): Promise<void>;
  verifyEmailOtp(email: string, token: string): Promise<AccountUser>;
  /** Apply a magic-link redirect. Null when the URL is not an auth callback. */
  completeMagicLink(url: string): Promise<AccountUser | null>;
  signOut(): Promise<void>;
  createHousehold(name: string): Promise<{ id: string; inviteCode: string }>;
  joinHousehold(code: string): Promise<string>;
  rotateInviteCode(householdId: string): Promise<string>;
  getHousehold(id: string): Promise<HouseholdSummary | null>;
  listHouseholds(): Promise<HouseholdSummary[]>;
  listMembers(householdId: string): Promise<HouseholdMember[]>;
  updateDisplayName(householdId: string, userId: string, displayName: string): Promise<void>;
  removeMember(householdId: string, userId: string): Promise<void>;
}

export interface AccountIdentity {
  userId?: string;
  householdId?: string;
}

export interface AccountState {
  /** False when EXPO_PUBLIC_SUPABASE_* are absent — the app stays solo. */
  configured: boolean;
  error?: string;
  user: AccountUser | null;
  household: HouseholdSummary | null;
  /** Set when the user belongs to more than one household and has not picked one. */
  households: HouseholdSummary[];
  role: 'owner' | 'member' | null;
  members: HouseholdMember[];
  displayName: string;
}

export type AccountResult = { ok: true } | { ok: false; error: string };

interface PersistedHousehold {
  userId?: string;
  email?: string;
  householdId?: string;
  displayName?: string;
  household?: HouseholdSummary;
  role?: 'owner' | 'member' | null;
  members?: HouseholdMember[];
}

export function emptyAccountState(configured = false): AccountState {
  return {
    configured,
    user: null,
    household: null,
    households: [],
    role: null,
    members: [],
    displayName: '',
  };
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Keep digits only, capped at the 6-digit Supabase email code. */
export function normalizeOtp(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

export interface AccountControllerDeps {
  kv: KeyValueStore;
  backend: AccountBackend | null;
  setIdentity: (identity: AccountIdentity) => void;
  canUse?: CanUse;
}

export function createAccountController({
  kv,
  backend,
  setIdentity,
  canUse = defaultCanUse,
}: AccountControllerDeps) {
  let state: AccountState = emptyAccountState(!!backend);
  const listeners = new Set<(next: AccountState) => void>();
  let restoring: Promise<void> | null = null;

  function publish(): void {
    setIdentity({ userId: state.user?.id, householdId: state.household?.id });
    for (const listener of listeners) listener(state);
  }

  /** The account (email-code sign-in) serves personal cloud sync + AI assistants AND household sharing. */
  function accountAvailable(): boolean {
    return canUse('cloudSync') || canUse('householdSync');
  }

  function unavailable(scope: 'account' | 'household'): { ok: false; error: string } | null {
    if (scope === 'household' && !canUse('householdSync')) return { ok: false, error: 'Household sharing is not available.' };
    if (!accountAvailable()) return { ok: false, error: 'Sign-in is not available.' };
    if (!backend) return { ok: false, error: 'Cloud sync is not configured on this build.' };
    return null;
  }

  async function readCache(): Promise<PersistedHousehold | null> {
    try {
      const raw = await kv.getItem(HOUSEHOLD_SESSION_KEY);
      return raw ? (JSON.parse(raw) as PersistedHousehold) : null;
    } catch {
      return null;
    }
  }

  function cacheToState(cached: PersistedHousehold): AccountState {
    return {
      configured: true,
      user: cached.userId ? { id: cached.userId, email: cached.email } : null,
      household: canUse('householdSync') ? (cached.household ?? null) : null,
      households: [],
      role: cached.role ?? null,
      members: cached.members ?? [],
      displayName: cached.displayName ?? '',
    };
  }

  async function persist(): Promise<void> {
    if (!state.user) {
      await kv.removeItem(HOUSEHOLD_SESSION_KEY);
      return;
    }
    const payload: PersistedHousehold = {
      userId: state.user.id,
      email: state.user.email,
      householdId: state.household?.id,
      displayName: state.displayName,
      household: state.household ?? undefined,
      role: state.role,
      members: state.members,
    };
    await kv.setItem(HOUSEHOLD_SESSION_KEY, JSON.stringify(payload));
  }

  async function loadMembership(preferredId?: string): Promise<void> {
    if (!backend || !state.user) return;
    if (!canUse('householdSync')) {
      // Household sharing is its own (optional) feature; without it the user syncs their personal space only.
      state = { ...state, households: [], household: null, members: [], role: null };
      return;
    }
    const households = await backend.listHouseholds();
    const pick = households.find((h) => h.id === preferredId) ?? (households.length === 1 ? households[0] : undefined);
    if (!pick) {
      state = { ...state, households, household: null, members: [], role: null };
      return;
    }
    const members = await backend.listMembers(pick.id);
    const me = members.find((m) => m.userId === state.user?.id);
    state = {
      ...state,
      households: [],
      household: pick,
      members,
      role: me?.role ?? null,
      displayName: me?.displayName?.trim() ?? '',
    };
  }

  async function run(fn: () => Promise<void>, scope: 'account' | 'household' = 'account'): Promise<AccountResult> {
    const blocked = unavailable(scope);
    if (blocked) {
      state = { ...state, error: blocked.error };
      publish();
      return blocked;
    }
    try {
      await fn();
      state = { ...state, error: undefined };
      await persist();
      publish();
      return { ok: true };
    } catch (error) {
      const message = errorMessage(error);
      state = { ...state, error: message };
      publish();
      return { ok: false, error: message };
    }
  }

  async function doRestore(): Promise<void> {
    const cached = await readCache();
    if (!accountAvailable() || !backend) {
      state = emptyAccountState(!!backend);
      publish();
      return;
    }
    if (cached?.userId) {
      state = cacheToState(cached);
      publish();
    }
    try {
      const session = await backend.getSession();
      if (!session) {
        state = emptyAccountState(true);
        await kv.removeItem(HOUSEHOLD_SESSION_KEY);
        publish();
        return;
      }
      state = {
        ...state,
        configured: true,
        user: { id: session.id, email: session.email ?? cached?.email },
        error: undefined,
      };
      try {
        await loadMembership(cached?.userId === session.id ? cached.householdId : undefined);
      } catch (error) {
        if (cached?.userId === session.id && cached.household) {
          state = { ...cacheToState(cached), user: state.user, error: errorMessage(error) };
        } else {
          state = { ...state, household: null, members: [], role: null, error: errorMessage(error) };
        }
        publish();
        return;
      }
      state = { ...state, error: undefined };
      await persist();
      publish();
    } catch (error) {
      if (cached?.userId) state = { ...cacheToState(cached), error: errorMessage(error) };
      else state = { ...emptyAccountState(true), error: errorMessage(error) };
      publish();
    }
  }

  return {
    getState: (): AccountState => state,
    subscribe(listener: (next: AccountState) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Load the cached household immediately, then refresh from the session (offline-safe). */
    restore(): Promise<void> {
      if (!restoring) {
        restoring = doRestore().finally(() => {
          restoring = null;
        });
      }
      return restoring;
    },
    async refresh(): Promise<AccountResult> {
      await this.restore();
      return state.error ? { ok: false, error: state.error } : { ok: true };
    },
    sendCode(email: string): Promise<AccountResult> {
      const trimmed = email.trim();
      if (!isEmail(trimmed)) return Promise.resolve({ ok: false, error: 'Enter a valid email address.' });
      return run(async () => {
        await backend!.sendEmailOtp(trimmed, AUTH_REDIRECT);
      });
    },
    verifyCode(email: string, token: string): Promise<AccountResult> {
      const code = normalizeOtp(token);
      if (code.length !== 6) return Promise.resolve({ ok: false, error: 'Enter the 6-digit code from your email.' });
      return run(async () => {
        const user = await backend!.verifyEmailOtp(email.trim(), code);
        state = { ...state, user, configured: true };
        await loadMembership((await readCache())?.householdId);
      });
    },
    completeMagicLink(url: string): Promise<AccountResult> {
      // Recipe and cook deep links share the app scheme; ignore anything that is not an auth redirect.
      if (!readMagicLink(url)) return Promise.resolve({ ok: true });
      return run(async () => {
        const user = await backend!.completeMagicLink(url);
        if (!user) return;
        state = { ...state, user, configured: true };
        await loadMembership((await readCache())?.householdId);
      });
    },
    signOut(): Promise<AccountResult> {
      return run(async () => {
        await backend!.signOut();
        state = emptyAccountState(true);
      });
    },
    createHousehold(name: string): Promise<AccountResult> {
      const trimmed = name.trim();
      if (!trimmed || trimmed.length > 100) {
        return Promise.resolve({ ok: false, error: 'Enter a household name (100 characters or fewer).' });
      }
      return run(async () => {
        if (!state.user) throw new Error('Sign in first.');
        const created = await backend!.createHousehold(trimmed);
        const household = await backend!.getHousehold(created.id);
        if (!household) throw new Error('Could not load the new household.');
        const members = await backend!.listMembers(created.id);
        const me = members.find((m) => m.userId === state.user?.id);
        state = {
          ...state,
          household,
          members,
          role: me?.role ?? 'owner',
          households: [],
          displayName: me?.displayName?.trim() ?? state.displayName,
        };
      }, 'household');
    },
    joinWithCode(code: string): Promise<AccountResult> {
      const trimmed = code.trim();
      if (trimmed.length < 4) return Promise.resolve({ ok: false, error: 'Enter the invite code.' });
      return run(async () => {
        if (!state.user) throw new Error('Sign in first.');
        const id = await backend!.joinHousehold(trimmed);
        await loadMembership(id);
        if (!state.household) throw new Error('Could not join that household.');
      }, 'household');
    },
    selectHousehold(id: string): Promise<AccountResult> {
      return run(async () => {
        if (!state.user) throw new Error('Sign in first.');
        await loadMembership(id);
        if (state.household?.id !== id) throw new Error('That household is not available.');
      }, 'household');
    },
    rotateInvite(): Promise<AccountResult> {
      return run(async () => {
        if (!state.household || !state.user) throw new Error('Join a household first.');
        if (state.role !== 'owner') throw new Error('Only the owner can rotate the invite code.');
        const inviteCode = await backend!.rotateInviteCode(state.household.id);
        state = { ...state, household: { ...state.household, inviteCode } };
      }, 'household');
    },
    leave(): Promise<AccountResult> {
      return run(async () => {
        if (!state.household || !state.user) throw new Error('You are not in a household.');
        await backend!.removeMember(state.household.id, state.user.id);
        state = { ...state, household: null, members: [], role: null, households: [] };
      }, 'household');
    },
    removeMember(userId: string): Promise<AccountResult> {
      return run(async () => {
        if (!state.household || !state.user) throw new Error('Join a household first.');
        if (state.role !== 'owner') throw new Error('Only the owner can remove members.');
        if (userId === state.user.id) throw new Error('Use leave to remove yourself.');
        await backend!.removeMember(state.household.id, userId);
        state = { ...state, members: state.members.filter((m) => m.userId !== userId) };
      }, 'household');
    },
    setDisplayName(name: string): Promise<AccountResult> {
      const trimmed = name.trim().slice(0, 80);
      return run(async () => {
        if (!state.household || !state.user) throw new Error('Join a household first.');
        await backend!.updateDisplayName(state.household.id, state.user.id, trimmed);
        state = {
          ...state,
          displayName: trimmed,
          members: state.members.map((m) =>
            m.userId === state.user?.id ? { ...m, displayName: trimmed || null } : m,
          ),
        };
      }, 'household');
    },
  };
}

export type AccountController = ReturnType<typeof createAccountController>;
