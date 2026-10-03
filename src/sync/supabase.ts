/**
 * Supabase adapter (spec #25, docs/SYNC.md). Loaded lazily — only when EXPO_PUBLIC_SUPABASE_* are set —
 * so signed-out / unconfigured builds never touch the network.
 */
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { SyncTable } from '@/types/sync';

import type { AccountBackend, AccountUser, HouseholdMember, HouseholdSummary } from './account';
import { readMagicLink } from './auth-url';
import type { SupabaseConfig } from './config';
import { SYNC_TABLES } from './engine';
import { fromRow, toRow, type DbRow } from './rows';
import type { RemoteAdapter } from './types';

export function createSupabase(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
}

/** RemoteAdapter over PostgREST. RLS on the server restricts rows to the caller's households. */
export function createSupabaseRemote(client: SupabaseClient): RemoteAdapter {
  return {
    async pull(table: SyncTable, householdId: string, sinceIso?: string) {
      let q = client.from(table).select('*').eq('household_id', householdId).order('updated_at').limit(1000);
      if (sinceIso) q = q.gt('updated_at', sinceIso);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as DbRow[]).map(fromRow);
    },
    async push(table: SyncTable, records) {
      const rows = records.map((r) => toRow(table, r as never));
      const { error } = await client.from(table).upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    },
  };
}

// ---- Auth (email OTP / magic link) + households. UI lives elsewhere; these are thin wrappers. ----

export async function sendEmailOtp(client: SupabaseClient, email: string, redirectTo?: string) {
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  if (error) throw error;
}

export async function verifyEmailOtp(client: SupabaseClient, email: string, token: string) {
  const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  return data.user;
}

/** Creates a household owned by the caller; returns { id, invite_code }. (SQL: public.create_household) */
export async function createHousehold(client: SupabaseClient, name: string) {
  const { data, error } = await client.rpc('create_household', { p_name: name });
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : [data]) as { id: string; invite_code: string }[];
  return rows[0];
}

/** Joins a household by invite code as 'member'; returns the household id. (SQL: public.join_household) */
export async function joinHousehold(client: SupabaseClient, inviteCode: string) {
  const { data, error } = await client.rpc('join_household', { p_code: inviteCode.trim().toUpperCase() });
  if (error) throw error;
  return data as string;
}

interface HouseholdRow {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
}

interface MemberRow {
  household_id: string;
  user_id: string;
  role: 'owner' | 'member';
  display_name: string | null;
  joined_at: string;
}

function mapHousehold(row: HouseholdRow): HouseholdSummary {
  return { id: row.id, name: row.name, inviteCode: row.invite_code, createdBy: row.created_by };
}

function mapMember(row: MemberRow): HouseholdMember {
  return {
    householdId: row.household_id,
    userId: row.user_id,
    role: row.role,
    displayName: row.display_name,
    joinedAt: row.joined_at,
  };
}

function userFrom(user: { id: string; email?: string } | null): AccountUser | null {
  return user ? { id: user.id, email: user.email } : null;
}

/** AccountBackend over Supabase Auth + the household RPCs. */
export function createSupabaseAccount(client: SupabaseClient): AccountBackend {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return userFrom(data.session?.user ?? null);
    },
    async sendEmailOtp(email, redirectTo) {
      await sendEmailOtp(client, email, redirectTo);
    },
    async verifyEmailOtp(email, token) {
      const user = await verifyEmailOtp(client, email, token);
      const mapped = userFrom(user);
      if (!mapped) throw new Error('That code did not sign you in. Request a new one and try again.');
      return mapped;
    },
    async completeMagicLink(url) {
      const parsed = readMagicLink(url);
      if (!parsed) return null;
      if (parsed.accessToken && parsed.refreshToken) {
        const { data, error } = await client.auth.setSession({
          access_token: parsed.accessToken,
          refresh_token: parsed.refreshToken,
        });
        if (error) throw error;
        const mapped = userFrom(data.user ?? data.session?.user ?? null);
        if (!mapped) throw new Error('Could not start a session from that link.');
        return mapped;
      }
      if (parsed.code) {
        const { data, error } = await client.auth.exchangeCodeForSession(parsed.code);
        if (error) throw error;
        const mapped = userFrom(data.user ?? data.session?.user ?? null);
        if (!mapped) throw new Error('Could not start a session from that link.');
        return mapped;
      }
      if (parsed.token && parsed.email) {
        const user = await verifyEmailOtp(client, parsed.email, parsed.token);
        const mapped = userFrom(user);
        if (!mapped) throw new Error('Could not start a session from that link.');
        return mapped;
      }
      return null;
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
    async createHousehold(name) {
      const created = await createHousehold(client, name);
      if (!created?.id || !created.invite_code) throw new Error('Could not create the household.');
      return { id: created.id, inviteCode: created.invite_code };
    },
    joinHousehold(code) {
      return joinHousehold(client, code);
    },
    async rotateInviteCode(householdId) {
      const { data, error } = await client.rpc('rotate_invite_code', { p_household: householdId });
      if (error) throw error;
      if (typeof data !== 'string' || !data) throw new Error('Could not rotate the invite code.');
      return data;
    },
    async getHousehold(id) {
      const { data, error } = await client
        .from('households')
        .select('id,name,invite_code,created_by')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapHousehold(data as HouseholdRow) : null;
    },
    async listHouseholds() {
      const { data, error } = await client.from('households').select('id,name,invite_code,created_by').order('name');
      if (error) throw error;
      return ((data ?? []) as HouseholdRow[]).map(mapHousehold);
    },
    async listMembers(householdId) {
      const { data, error } = await client
        .from('household_members')
        .select('household_id,user_id,role,display_name,joined_at')
        .eq('household_id', householdId)
        .order('joined_at');
      if (error) throw error;
      return ((data ?? []) as MemberRow[]).map(mapMember);
    },
    async updateDisplayName(householdId, userId, displayName) {
      const { error } = await client
        .from('household_members')
        .update({ display_name: displayName.trim() || null })
        .eq('household_id', householdId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    async removeMember(householdId, userId) {
      const { error } = await client
        .from('household_members')
        .delete()
        .eq('household_id', householdId)
        .eq('user_id', userId);
      if (error) throw error;
    },
  };
}

/**
 * Optional realtime (docs/SYNC.md). RLS still applies. The caller treats failures as "realtime off"
 * and keeps syncing on foreground / writes / pull-to-refresh.
 */
export function subscribeHouseholdRealtime(
  client: SupabaseClient,
  householdId: string,
  onChange: () => void,
): () => void {
  const channel = client.channel(`household-sync:${householdId}`);
  for (const table of SYNC_TABLES) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
      () => onChange(),
    );
  }
  channel.subscribe();
  return () => {
    void client.removeChannel(channel);
  };
}
