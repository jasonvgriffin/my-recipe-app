/**
 * @jest-environment node
 */
import {
  createMcpHandler,
  createMemoryRateLimiter,
  createMemoryRepo,
  createSealer,
  isAllowedRedirectUri,
  pkceMatches,
  b64url,
  type McpAuthBackend,
} from '@/mcp';
import { isPublicHttpUrl, toolDefinitions } from '@/mcp/tools';
import type { FeatureId } from '@/entitlements';

const ISSUER = 'https://ref.supabase.co/functions/v1/mcp';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const NOW = new Date('2026-10-05T15:00:00Z'); // a Monday
const VERIFIER = 'v'.repeat(43) + '-._~abc';

async function challengeFor(verifier: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

const RECIPE_HTML = `<html><head><script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Web Lemon Bars',
  recipeIngredient: ['1 cup almond flour', '1/2 cup allulose', '3 lemons'],
  recipeInstructions: ['Mix.', 'Bake 25 minutes.'],
  recipeYield: '9',
})}</script></head><body></body></html>`;

async function setup(opts: { household?: boolean; canUse?: (id: FeatureId) => boolean; perMinute?: number } = {}) {
  const sealer = await createSealer('test-secret-0123456789', () => NOW);
  const repo = createMemoryRepo('h1', 'u1', () => NOW);
  const sent: string[] = [];
  let refreshCount = 0;
  const auth: McpAuthBackend = {
    async sendCode(email) {
      if (email !== 'jason@example.com') throw new Error('Signups not allowed for otp');
      sent.push(email);
    },
    async verifyCode(email, code) {
      if (email !== 'jason@example.com' || code !== '123456') throw new Error('Token has expired or is invalid');
      return { accessToken: 'sb-access-1', refreshToken: 'sb-refresh-1', expiresIn: 3600, userId: 'u1' };
    },
    async refresh(rt) {
      if (rt !== 'sb-refresh-1') throw new Error('invalid');
      refreshCount++;
      return { accessToken: 'sb-access-2', refreshToken: 'sb-refresh-1', expiresIn: 3600, userId: 'u1' };
    },
    async getUser(at) {
      return at.startsWith('sb-access') ? { id: 'u1', email: 'jason@example.com' } : undefined;
    },
  };
  const fetched: string[] = [];
  const handler = createMcpHandler({
    issuer: ISSUER,
    sealer,
    auth,
    connect: async () => (opts.household === false ? undefined : repo),
    rateLimiter: (() => {
      const limiter = createMemoryRateLimiter({ perMinute: opts.perMinute ?? 1000, perDay: 10_000 }, () => NOW);
      return () => limiter;
    })(),
    fetchHtml: async (url) => {
      fetched.push(url);
      return RECIPE_HTML;
    },
    canUse: opts.canUse ?? (() => true),
    now: () => NOW,
  });
  const call = (path: string, init?: RequestInit) => handler(new Request(`${ISSUER}${path}`, init));
  const form = (path: string, body: Record<string, string>) =>
    call(path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });

  async function connect() {
    const reg = await call('/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: 'Claude' }),
    });
    const { client_id } = (await reg.json()) as { client_id: string };
    const challenge = await challengeFor(VERIFIER);
    const page = await call(
      `/authorize?response_type=code&client_id=${encodeURIComponent(client_id)}&redirect_uri=${encodeURIComponent(REDIRECT)}&code_challenge=${challenge}&code_challenge_method=S256&state=st8`,
    );
    const request = (await page.text()).match(/name="request" value="([^"]+)"/)![1];
    const step2 = await form('/authorize', { request, step: 'send', email: 'Jason@Example.com' });
    expect(await step2.text()).toContain('Code sent to jason@example.com');
    const done = await form('/authorize', { request, step: 'verify', email: 'jason@example.com', code: '123 456' });
    return { done, client_id, request };
  }

  async function token() {
    const { done, client_id } = await connect();
    expect(done.status).toBe(302);
    const loc = new URL(done.headers.get('location')!);
    const res = await form('/token', {
      grant_type: 'authorization_code',
      code: loc.searchParams.get('code')!,
      client_id,
      redirect_uri: REDIRECT,
      code_verifier: VERIFIER,
    });
    return (await res.json()) as { access_token: string; refresh_token: string; token_type: string; expires_in: number };
  }

  let rpcId = 0;
  async function rpc(accessToken: string, method: string, params?: unknown) {
    const res = await call('', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    });
    return { status: res.status, headers: res.headers, body: res.status === 202 ? undefined : ((await res.json()) as any) };
  }
  async function tool(accessToken: string, name: string, args: unknown = {}) {
    const r = await rpc(accessToken, 'tools/call', { name, arguments: args });
    return r.body.result as { isError?: boolean; structuredContent?: any; content: { text: string }[] };
  }

  return { call, form, connect, token, rpc, tool, repo, sent, fetched, refreshCount: () => refreshCount };
}

describe('MCP server: OAuth discovery and auth', () => {
  it('serves OAuth metadata and challenges unauthenticated MCP calls', async () => {
    const s = await setup();
    const as = await (await s.call('/.well-known/oauth-authorization-server')).json();
    expect(as).toMatchObject({
      issuer: ISSUER,
      token_endpoint: `${ISSUER}/token`,
      registration_endpoint: `${ISSUER}/register`,
      code_challenge_methods_supported: ['S256'],
    });
    expect((await (await s.call('/.well-known/openid-configuration')).json()).issuer).toBe(ISSUER);
    expect((await (await s.call('/.well-known/oauth-protected-resource')).json()).authorization_servers).toEqual([ISSUER]);
    const res = await s.call('', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain(`resource_metadata="${ISSUER}/.well-known/oauth-protected-resource"`);
    expect((await s.call('', { method: 'GET' })).status).toBe(405);
  });

  it('signs in with the household email code, exchanges the code with PKCE, and refreshes', async () => {
    const s = await setup();
    const { done } = await s.connect();
    expect(s.sent).toEqual(['jason@example.com']);
    const loc = new URL(done.headers.get('location')!);
    expect(loc.origin + loc.pathname).toBe(REDIRECT);
    expect(loc.searchParams.get('state')).toBe('st8');
    const t = await s.token();
    expect(t.token_type).toBe('Bearer');
    expect(t.expires_in).toBe(3600);
    expect(t.access_token).not.toContain('sb-access'); // Supabase tokens are sealed, never handed out raw
    const refreshed = await s.form('/token', { grant_type: 'refresh_token', refresh_token: t.refresh_token });
    expect(refreshed.status).toBe(200);
    expect(s.refreshCount()).toBe(1);
    const init = await s.rpc(((await refreshed.json()) as { access_token: string }).access_token, 'initialize', {
      protocolVersion: '2025-06-18',
    });
    expect(init.body.result).toMatchObject({ protocolVersion: '2025-06-18', serverInfo: { name: 'my-recipe-app' } });
  });

  it('rejects a wrong PKCE verifier, a mismatched redirect, bad codes and unknown emails', async () => {
    const s = await setup();
    const { done, client_id, request } = await s.connect();
    const code = new URL(done.headers.get('location')!).searchParams.get('code')!;
    const bad = await s.form('/token', { grant_type: 'authorization_code', code, client_id, code_verifier: 'x'.repeat(43) });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('invalid_grant');
    const wrongRedirect = await s.form('/token', {
      grant_type: 'authorization_code',
      code,
      client_id,
      redirect_uri: 'https://evil.example/cb',
      code_verifier: VERIFIER,
    });
    expect(wrongRedirect.status).toBe(400);
    const wrongCode = await s.form('/authorize', { request, step: 'verify', email: 'jason@example.com', code: '000000' });
    expect(await wrongCode.text()).toContain('That code did not work');
    const stranger = await s.form('/authorize', { request, step: 'send', email: 'someone@example.com' });
    expect(await stranger.text()).toContain('Use the email you signed in with');
    const unregistered = await s.call(
      `/authorize?response_type=code&client_id=${encodeURIComponent(client_id)}&redirect_uri=${encodeURIComponent('https://evil.example/cb')}&code_challenge=abc`,
    );
    expect(unregistered.status).toBe(400);
    const regBad = await s.call('/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['javascript:alert(1)'] }),
    });
    expect(regBad.status).toBe(400);
    expect((await s.rpc('not-a-token', 'ping')).status).toBe(401);
  });

  it('requires a household with synced recipes', async () => {
    const s = await setup({ household: false });
    const { done } = await s.connect();
    expect(done.status).toBe(200);
    expect(await done.text()).toContain('No household found');
  });

  it('enforces the mcpAccess entitlement server-side', async () => {
    let allowed = true;
    const s = await setup({ canUse: (id) => (id === 'mcpAccess' ? allowed : true) });
    const t = await s.token();
    expect((await s.rpc(t.access_token, 'ping')).status).toBe(200);
    allowed = false;
    expect((await s.rpc(t.access_token, 'ping')).status).toBe(403);
  });

  it('rate limits per user with 429 and Retry-After', async () => {
    const s = await setup({ perMinute: 2 });
    const t = await s.token();
    expect((await s.rpc(t.access_token, 'ping')).status).toBe(200);
    expect((await s.rpc(t.access_token, 'ping')).status).toBe(200);
    const limited = await s.rpc(t.access_token, 'ping');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('MCP server: tools', () => {
  it('lists tools without any nutrition tool', async () => {
    const names = toolDefinitions().map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(['add_recipe', 'update_recipe', 'search_recipes', 'get_recipe', 'list_tags', 'plan_meal', 'build_shopping_list']),
    );
    expect(JSON.stringify(toolDefinitions())).not.toMatch(/nutri|calori|macro|protein/i);
    expect(toolDefinitions().every((t) => (t.inputSchema as { type?: string }).type === 'object')).toBe(true);
  });

  it('adds, finds, reads and edits recipes through importRecipe rules', async () => {
    const s = await setup();
    const { access_token: at } = await s.token();
    const listed = await s.rpc(at, 'tools/list');
    expect(listed.body.result.tools.length).toBeGreaterThan(5);

    const added = await s.tool(at, 'add_recipe', {
      recipe: {
        title: 'Allulose Lemon Curd',
        ingredients: ['3 lemons', '1/2 cup allulose', '4 egg yolks'],
        steps: ['Whisk.', 'Cook 10 minutes.'],
        servings: 6,
        tags: ['Dessert'],
        categories: ['Desserts'],
        nutrition: { calories: 120 },
      },
    });
    expect(added.isError).toBeUndefined();
    const id = added.structuredContent.recipe.id as string;
    expect(added.structuredContent.recipe).toMatchObject({ title: 'Allulose Lemon Curd', categories: ['Desserts'] });
    const stored = s.repo.tables.recipes.get(id)!;
    expect(stored).toMatchObject({ householdId: 'h1', createdBy: 'u1' });
    expect('nutrition' in stored).toBe(false);

    const monk = await s.tool(at, 'add_recipe', { recipe: { title: 'Bad', ingredients: ['1 tbsp monk fruit'], steps: ['Mix.'] } });
    expect(monk.isError).toBe(true);
    expect(monk.content[0].text).toMatch(/forbidden_ingredient/);

    const found = await s.tool(at, 'search_recipes', { query: 'lemon' });
    expect(found.structuredContent.recipes.map((r: { id: string }) => r.id)).toEqual([id]);
    expect((await s.tool(at, 'search_recipes', { category: 'desserts' })).structuredContent.total).toBe(1);
    expect((await s.tool(at, 'list_tags')).structuredContent.tags).toEqual(['dessert']);
    expect((await s.tool(at, 'list_categories')).structuredContent.categories).toEqual(['Desserts']);

    const updated = await s.tool(at, 'update_recipe', { id, servings: 8, rating: 5, tags: ['dessert', 'citrus'] });
    expect(updated.structuredContent).toMatchObject({ servings: 8, rating: 5, tags: ['dessert', 'citrus'], categories: ['Desserts'] });
    const swapped = await s.tool(at, 'update_recipe', { id, ingredients: ['3 lemons', 'monk fruit'] });
    expect(swapped.isError).toBe(true);
    const got = await s.tool(at, 'get_recipe', { id });
    expect(got.structuredContent.ingredients).toEqual(['3 lemons', '1/2 cup allulose', '4 egg yolks']);
    expect((await s.tool(at, 'get_recipe', { id: 'missing' })).isError).toBe(true);
    expect((await s.tool(at, 'nope')).isError).toBe(true);
  });

  it('imports from a public URL once (dedupe) and refuses private addresses', async () => {
    const s = await setup();
    const { access_token: at } = await s.token();
    const first = await s.tool(at, 'add_recipe', { url: 'https://example.com/lemon-bars' });
    expect(first.structuredContent).toMatchObject({ status: 'created', recipe: { title: 'Web Lemon Bars', servings: 9 } });
    const again = await s.tool(at, 'add_recipe', { url: 'https://example.com/lemon-bars' });
    expect(again.structuredContent.status).toBe('duplicate');
    expect(s.repo.tables.recipes.size).toBe(1);
    expect((await s.tool(at, 'add_recipe', { url: 'http://169.254.169.254/latest' })).isError).toBe(true);
    expect(s.fetched).toEqual(['https://example.com/lemon-bars', 'https://example.com/lemon-bars']);
    expect(isPublicHttpUrl('http://localhost:3000/x')).toBe(false);
    expect(isPublicHttpUrl('http://10.0.0.5/x')).toBe(false);
    expect(isPublicHttpUrl('http://[::1]/x')).toBe(false);
    expect(isPublicHttpUrl('https://www.allrecipes.com/recipe/1')).toBe(true);
  });

  it('plans meals and builds the shopping list from the plan', async () => {
    const s = await setup();
    const { access_token: at } = await s.token();
    const added = await s.tool(at, 'add_recipe', {
      recipe: { title: 'Chicken Bowl', ingredients: ['2 chicken breasts', '1 tbsp olive oil'], steps: ['Cook.'], servings: 2 },
    });
    const recipeId = added.structuredContent.recipe.id;
    s.repo.tables.pantry_items.set('p1', { id: 'p1', name: 'olive oil', createdAt: '', updatedAt: '' });
    const planned = await s.tool(at, 'plan_meal', { date: '2026-10-06', recipeId, slot: 'dinner' });
    expect(planned.structuredContent).toMatchObject({ date: '2026-10-06', slot: 'dinner', title: 'Chicken Bowl' });
    const plan = await s.tool(at, 'get_meal_plan', { start: '2026-10-05', days: 7 });
    expect(plan.structuredContent.meals.map((m: { title: string }) => m.title)).toEqual(['Chicken Bowl']);

    const built = await s.tool(at, 'build_shopping_list', {});
    expect(built.structuredContent.weekStart).toBe('2026-10-05');
    expect(built.structuredContent.items.map((i: { text: string }) => i.text)).toEqual(['2 chicken breasts']); // olive oil is in the pantry
    const extra = await s.tool(at, 'add_shopping_item', { text: '1 bag lemons' });
    const itemId = extra.structuredContent.item.id;
    await s.tool(at, 'check_shopping_item', { itemId, checked: true });
    const rebuilt = await s.tool(at, 'build_shopping_list', {});
    expect(rebuilt.structuredContent.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: '1 bag lemons', checked: true })]),
    );
    const list = await s.tool(at, 'get_shopping_list', { weekStart: '2026-10-05' });
    expect(list.structuredContent.items).toHaveLength(2);
    expect((await s.tool(at, 'plan_meal', { date: 'next tuesday', recipeId })).isError).toBe(true);
  });
});

describe('MCP OAuth helpers', () => {
  it('verifies PKCE and redirect URIs', async () => {
    expect(await pkceMatches(VERIFIER, await challengeFor(VERIFIER))).toBe(true);
    expect(await pkceMatches('short', await challengeFor('short'))).toBe(false);
    expect(isAllowedRedirectUri('https://chatgpt.com/connector_platform_oauth_redirect')).toBe(true);
    expect(isAllowedRedirectUri('http://127.0.0.1:6274/oauth/callback')).toBe(true);
    expect(isAllowedRedirectUri('http://example.com/cb')).toBe(false);
    expect(isAllowedRedirectUri('javascript:alert(1)')).toBe(false);
  });

  it('expires and never mixes sealed token kinds', async () => {
    let now = NOW;
    const sealer = await createSealer('another-secret-0123456789', () => now);
    const code = await sealer.seal('code', { a: 1 }, 60);
    expect(await sealer.open('code', code)).toMatchObject({ a: 1 });
    expect(await sealer.open('access', code)).toBeUndefined();
    now = new Date(NOW.getTime() + 61_000);
    expect(await sealer.open('code', code)).toBeUndefined();
    expect(await sealer.open('code', code.slice(0, -2) + 'AA')).toBeUndefined();
  });
});

describe('MCP Supabase bindings', () => {
  it('reads and writes synced rows with the app row mapping', async () => {
    const { createSupabaseRepo, createRpcRateLimiter } = require('@/mcp') as typeof import('@/mcp');
    const upserts: unknown[] = [];
    const filters: string[] = [];
    const row = {
      id: 'r1',
      household_id: 'h1',
      created_by: 'u2',
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
      deleted_at: null,
      title: 'Soup',
      data: { title: 'Soup', ingredients: [{ text: 'water' }], steps: [{ text: 'Boil.' }], tags: [], servings: 2 },
    };
    const client = {
      from: (table: string) => ({
        select: () => ({
          eq: (col: string, val: string) => ({
            is: async (col2: string) => {
              filters.push(`${table}:${col}=${val}:${col2}`);
              return { data: [row], error: null };
            },
          }),
        }),
        upsert: async (rows: unknown[]) => {
          upserts.push(...rows);
          return { error: null };
        },
      }),
    };
    const repo = createSupabaseRepo(client, { householdId: 'h1', userId: 'u1', now: () => NOW });
    const [rec] = await repo.list('recipes');
    expect(rec).toMatchObject({ id: 'r1', title: 'Soup', householdId: 'h1', createdBy: 'u2' });
    expect(filters).toEqual(['recipes:household_id=h1:deleted_at']);
    await repo.save('recipes', { ...rec, title: 'Better Soup' });
    expect(upserts[0]).toMatchObject({ id: 'r1', household_id: 'h1', created_by: 'u2', title: 'Better Soup', updated_at: NOW.toISOString() });
    await repo.remove('recipes', 'r1');
    expect(upserts[1]).toMatchObject({ id: 'r1', deleted_at: NOW.toISOString() });

    const calls: unknown[] = [];
    const limiter = createRpcRateLimiter(async (fn, args) => {
      calls.push([fn, args]);
      return { data: calls.length > 1 ? 30 : 0, error: null };
    });
    expect(await limiter.hit('u1')).toEqual({ ok: true });
    expect(await limiter.hit('u1')).toEqual({ ok: false, retryAfter: 30 });
    expect(calls[0]).toEqual(['mcp_rate_limit_hit', { p_per_minute: 60, p_per_day: 2000 }]);
  });
});
