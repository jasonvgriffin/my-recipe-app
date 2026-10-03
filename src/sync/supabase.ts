/**
 * Supabase adapter (spec #25, docs/SYNC.md). Loaded lazily — only when EXPO_PUBLIC_SUPABASE_* are set —
 * so signed-out / unconfigured builds never touch the network.
 */
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { SyncTable } from '@/types/sync';

import type { SupabaseConfig } from './config';
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
