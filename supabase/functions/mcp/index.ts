// Supabase Edge Function: remote MCP server for My Recipe App (docs/MCP.md).
// Thin binding only — all logic lives in src/mcp (tested with jest). Deploy:
//   supabase functions deploy mcp --no-verify-jwt --project-ref <ref>
// Env (set automatically by Supabase): SUPABASE_URL, SUPABASE_ANON_KEY.
// Optional secret: MCP_PUBLIC_URL (defaults to <SUPABASE_URL>/functions/v1/mcp).
// OAuth itself is Supabase Auth's OAuth 2.1 server (project Auth settings; docs/MCP.md "Deploying").
import { createClient } from '@supabase/supabase-js';

import {
  createMcpHandler,
  createRpcRateLimiter,
  createSupabaseRepo,
  supabaseAuthIssuer,
  type SupabaseLike,
} from '@/mcp/index.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!.replace(/\/+$/, '');
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const RESOURCE = (Deno.env.get('MCP_PUBLIC_URL') ?? `${SUPABASE_URL}/functions/v1/mcp`).replace(/\/+$/, '');
const AUTH_URL = supabaseAuthIssuer(SUPABASE_URL);

const anon = () => createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const asUser = (accessToken: string) =>
  createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

/** Supabase Auth REST call as a user (OAuth consent endpoints have no server-side supabase-js helper). */
async function authFetch(path: string, accessToken: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${AUTH_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`auth ${path}: HTTP ${res.status}`);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

const handler = createMcpHandler({
  resource: RESOURCE,
  authorizationServer: AUTH_URL,
  auth: {
    async sendCode(email) {
      const { error } = await anon().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      if (error) throw error;
    },
    async verifyCode(email, code) {
      const { data, error } = await anon().auth.verifyOtp({ email, token: code, type: 'email' });
      if (error || !data.session) throw error ?? new Error('no session');
      return { accessToken: data.session.access_token, userId: data.session.user.id };
    },
    async approve(authorizationId, accessToken) {
      const id = encodeURIComponent(authorizationId);
      // Loads the request for this user; already-consented clients come back with redirect_url directly.
      const details = await authFetch(`/oauth/authorizations/${id}`, accessToken);
      if (typeof details.redirect_url === 'string' && !details.authorization_id) return { redirectUrl: details.redirect_url };
      const out = await authFetch(`/oauth/authorizations/${id}/consent`, accessToken, { method: 'POST', body: { action: 'approve' } });
      if (typeof out.redirect_url !== 'string') throw new Error('no redirect_url');
      return { redirectUrl: out.redirect_url };
    },
    async endSession(accessToken) {
      await fetch(`${AUTH_URL}/logout?scope=local`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
      });
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
