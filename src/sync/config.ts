/**
 * Supabase configuration (spec #25). Values come from EXPO_PUBLIC_* env vars, which Expo inlines at
 * build time (local: `.env.local`, CI: GitHub Actions secrets/vars). Only the public ANON key belongs in
 * the app — NEVER the service_role key. When unset, the app runs fully offline/solo.
 */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function getSupabaseConfig(env: Record<string, string | undefined> = readEnv()): SupabaseConfig | undefined {
  const url = env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey || !/^https:\/\//.test(url)) return undefined;
  return { url: url.replace(/\/+$/, ''), anonKey };
}

export function isSyncConfigured(): boolean {
  return getSupabaseConfig() !== undefined;
}

function readEnv(): Record<string, string | undefined> {
  // Must be referenced literally so Expo's babel plugin can inline them.
  return {
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  };
}
