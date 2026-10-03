// Supabase Edge Function: remote MCP server for My Recipe App (docs/MCP.md).
// Thin binding only — all logic lives in src/mcp (tested with jest). Deploy:
//   supabase functions deploy mcp --no-verify-jwt --project-ref <ref>
// Env (set automatically by Supabase): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Optional secrets: MCP_OAUTH_SECRET (sealing key; defaults to one derived from the service role key),
// MCP_PUBLIC_URL (defaults to <SUPABASE_URL>/functions/v1/mcp).
import { createClient } from '@supabase/supabase-js';

import {
  createMcpHandler,
  createRpcRateLimiter,
  createSealer,
  createSupabaseRepo,
  type AuthSession,
  type SupabaseLike,
} from '@/mcp/index.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SECRET = Deno.env.get('MCP_OAUTH_SECRET') ?? `derived:${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`;
const ISSUER = (Deno.env.get('MCP_PUBLIC_URL') ?? `${SUPABASE_URL}/functions/v1/mcp`).replace(/\/+$/, '');

const anon = () => createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const asUser = (accessToken: string) =>
  createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

function toSession(s: { access_token: string; refresh_token: string; expires_in: number; user: { id: string } } | null): AuthSession {
  if (!s) throw new Error('no session');
  return { accessToken: s.access_token, refreshToken: s.refresh_token, expiresIn: s.expires_in, userId: s.user.id };
}

const sealer = await createSealer(SECRET);

const handler = createMcpHandler({
  issuer: ISSUER,
  sealer,
  auth: {
    async sendCode(email) {
      const { error } = await anon().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (error) throw error;
    },
    async verifyCode(email, code) {
      const { data, error } = await anon().auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) throw error;
      return toSession(data.session);
    },
    async refresh(refreshToken) {
      const { data, error } = await anon().auth.refreshSession({ refresh_token: refreshToken });
      if (error) throw error;
      return toSession(data.session);
    },
    async getUser(accessToken) {
      const { data, error } = await anon().auth.getUser(accessToken);
      if (error || !data.user) return undefined;
      return { id: data.user.id, email: data.user.email ?? undefined };
    },
  },
  async connect(accessToken, userId) {
    const client = asUser(accessToken);
    const { data } = await client
      .from('household_members')
      .select('household_id, joined_at')
      .eq('user_id', userId)
      .order('joined_at', { ascending: false })
      .limit(1);
    const householdId = data?.[0]?.household_id as string | undefined;
    return householdId ? createSupabaseRepo(client as unknown as SupabaseLike, { householdId, userId }) : undefined;
  },
  rateLimiter: (accessToken) => createRpcRateLimiter((fn, args) => asUser(accessToken).rpc(fn, args)),
  async fetchHtml(url) {
    const res = await fetch(url, {
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'MyRecipeApp/1.0 (github.com/jasonvgriffin)' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.text()).slice(0, 5_000_000);
  },
});

Deno.serve(handler);
