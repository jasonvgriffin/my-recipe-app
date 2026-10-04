/**
 * @jest-environment node
 */
import {
  createMcpHandler,
  createMemoryRateLimiter,
  createMemoryRepo,
  isAuthorizationId,
  protectedResourceMetadata,
  supabaseAuthIssuer,
  type McpAuthBackend,
} from '@/mcp';
import { isPublicHttpUrl, toolDefinitions } from '@/mcp/tools';
import type { FeatureId } from '@/entitlements';

const RESOURCE = 'https://ref.supabase.co/functions/v1/mcp';
const AUTH_SERVER = 'https://ref.supabase.co/auth/v1';
const AUTH_ID = 'figzye2ye5tgratgakx4y4wf5yo5s6ki';
const REDIRECT = 'https://grok.com/connectors-oauth-exchange-code/';
const NOW = new Date('2026-10-05T15:00:00Z'); // a Monday
const OAUTH_TOKEN = 'sb-oauth-access-1'; // what Supabase Auth's token endpoint hands the client

const RECIPE_HTML = `<html><head><script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Web Lemon Bars',
  recipeIngredient: ['1 cup almond flour', '1/2 cup allulose', '3 lemons'],
  recipeInstructions: ['Mix.', 'Bake 25 minutes.'],
  recipeYield: '9',
})}</script></head><body></body></html>`;

async function setup(
  opts: { household?: boolean; reachable?: boolean; canUse?: (id: FeatureId) => boolean; perMinute?: number } = {},
) {
  // household: false = a user in NO household: their personal space (householdId null), v1.0.6.
  const repo = createMemoryRepo(opts.household === false ? null : 'h1', 'u1', () => NOW);
  const sent: string[] = [];
  const approved: string[] = [];
  const ended: string[] = [];
  const auth: McpAuthBackend = {
    async sendCode(email) {
      if (email !== 'jason@example.com') throw new Error('Signups not allowed for otp');
      sent.push(email);
    },
    async verifyCode(email, code) {
      if (email !== 'jason@example.com' || code !== '123456') throw new Error('Token has expired or is invalid');
      return { accessToken: 'sb-consent-session', userId: 'u1' };
    },
    async approve(id, at) {
      if (id !== AUTH_ID || at !== 'sb-consent-session') throw new Error('authorization not found');
      approved.push(id);
      return { redirectUrl: `${REDIRECT}?code=abc&state=st8` };
    },
    async endSession(at) {
      ended.push(at);
    },
    async getUser(at) {
      return at.startsWith('sb-') ? { id: 'u1', email: 'jason@example.com' } : undefined;
    },
  };
  const fetched: string[] = [];
  const handler = createMcpHandler({
    resource: RESOURCE,
    authorizationServer: AUTH_SERVER,
    auth,
    connect: async () => (opts.reachable === false ? undefined : repo),
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
  const call = (path: string, init?: RequestInit) => handler(new Request(`${RESOURCE}${path}`, init));
  const post = async (path: string, body: Record<string, string>) => {
    const res = await call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, headers: res.headers, body: (await res.json()) as { ok?: boolean; error?: string; redirect_url?: string } };
  };
  async function consent(email = 'Jason@Example.com', code = '123 456') {
    const step1 = await post('/consent/send', { email });
    if (step1.status !== 200) return step1;
    return post('/consent/verify', { email, code, authorization_id: AUTH_ID });
  }
  /** The access token a client holds after Supabase Auth's token endpoint (outside this server). */
  async function token() {
    return { access_token: OAUTH_TOKEN };
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

  return { call, post, consent, token, rpc, tool, repo, sent, approved, ended, fetched };
}

describe('MCP server: OAuth discovery and auth', () => {
  it('points clients at Supabase Auth and challenges unauthenticated MCP calls', async () => {
    const s = await setup();
    const prm = await (await s.call('/.well-known/oauth-protected-resource')).json();
    expect(prm).toMatchObject({ resource: RESOURCE, authorization_servers: [AUTH_SERVER], bearer_methods_supported: ['header'] });
    // RFC 9728 path-suffixed form some clients ask for on the resource path
    expect((await (await s.call('/.well-known/oauth-protected-resource/functions/v1/mcp')).json()).resource).toBe(RESOURCE);
    // The old self-hosted authorization server is gone (Supabase serves root-level RFC 8414 discovery).
    expect((await s.call('/.well-known/oauth-authorization-server')).status).toBe(404);
    expect((await s.call('/register', { method: 'POST', body: '{}' })).status).toBe(404);
    const res = await s.call('', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"initialize"}' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain(`resource_metadata="${RESOURCE}/.well-known/oauth-protected-resource"`);
    expect(res.headers.get('access-control-expose-headers')).toContain('WWW-Authenticate');
    // Discovery probe with a bare GET (rmcp / Grok): 401 + resource_metadata, never 405.
    for (const method of ['GET', 'DELETE']) {
      const probe = await s.call('', { method, headers: { 'mcp-protocol-version': '2024-11-05' } });
      expect(probe.status).toBe(401);
      expect(probe.headers.get('www-authenticate')).toContain(`resource_metadata="${RESOURCE}/.well-known/oauth-protected-resource"`);
    }
    expect((await s.call('', { method: 'GET', headers: { authorization: 'Bearer nope' } })).status).toBe(401);
    // Authenticated GET (SSE stream) is not offered: stateless JSON server.
    expect((await s.call('', { method: 'GET', headers: { authorization: `Bearer ${OAUTH_TOKEN}` } })).status).toBe(405);
    expect((await s.call('/consent/send', { method: 'OPTIONS' })).headers.get('access-control-allow-origin')).toBe('*');
  });

  it('consents with the household email code, approves the Supabase authorization, and ends the consent session', async () => {
    const s = await setup();
    const r = await s.consent();
    expect(r.status).toBe(200);
    expect(s.sent).toEqual(['jason@example.com']);
    expect(s.approved).toEqual([AUTH_ID]);
    expect(s.ended).toEqual(['sb-consent-session']);
    const to = new URL(r.body.redirect_url!);
    expect(to.origin + to.pathname).toBe(REDIRECT);
    expect(to.searchParams.get('state')).toBe('st8');
    const t = await s.token();
    const init = await s.rpc(t.access_token, 'initialize', { protocolVersion: '2025-06-18' });
    expect(init.body.result).toMatchObject({ protocolVersion: '2025-06-18', serverInfo: { name: 'my-recipe-app' } });
    expect((await s.rpc(t.access_token, 'initialize', { protocolVersion: '2099-01-01' })).body.result.protocolVersion).toBe('2025-06-18');
  });

  it('rejects bad codes, unknown emails, bad authorization ids and invalid tokens', async () => {
    const s = await setup();
    expect((await s.consent('jason@example.com', '000000')).body.error).toContain('That code did not work');
    expect((await s.consent('someone@example.com')).body.error).toContain('Use the email you signed in with');
    expect((await s.post('/consent/send', { email: 'nope' })).status).toBe(400);
    const badId = await s.post('/consent/verify', { email: 'jason@example.com', code: '123456', authorization_id: '../admin' });
    expect(badId.status).toBe(400);
    const expired = await s.post('/consent/verify', { email: 'jason@example.com', code: '123456', authorization_id: 'x'.repeat(20) });
    expect(expired.body.error).toContain('expired');
    expect(s.approved).toEqual([]);
    expect((await s.rpc('not-a-token', 'ping')).status).toBe(401);
  });

  it('does NOT need a household: a personal user consents and add_recipe / search_recipes use their personal space (v1.0.6)', async () => {
    const s = await setup({ household: false });
    const r = await s.consent();
    expect(r.status).toBe(200);
    expect(r.body.redirect_url).toContain('code=abc');
    expect(s.approved).toEqual([AUTH_ID]);
    expect(s.ended).toEqual(['sb-consent-session']);
    const { access_token: at } = await s.token();
    const added = await s.tool(at, 'add_recipe', {
      recipe: { title: 'Solo Allulose Muffins', ingredients: ['1 cup almond flour', '1/4 cup allulose'], steps: ['Bake.'] },
    });
    expect(added.isError).toBeUndefined();
    const id = added.structuredContent.recipe.id as string;
    const stored = s.repo.tables.recipes.get(id)!;
    expect(stored.householdId).toBeUndefined();
    expect(stored.createdBy).toBe('u1');
    const found = await s.tool(at, 'search_recipes', { query: 'muffins' });
    expect(JSON.stringify(found.structuredContent)).toContain(id);
  });

  it('reports an unreachable data store without approving', async () => {
    const s = await setup({ reachable: false });
    const r = await s.consent();
    expect(r.status).toBe(503);
    expect(s.approved).toEqual([]);
    expect(s.ended).toEqual(['sb-consent-session']);
  });

  it('enforces the mcpAccess entitlement server-side', async () => {
    let allowed = true;
    const s = await setup({ canUse: (id) => (id === 'mcpAccess' ? allowed : true) });
    const t = await s.token();
    expect((await s.rpc(t.access_token, 'ping')).status).toBe(200);
    allowed = false;
    expect((await s.rpc(t.access_token, 'ping')).status).toBe(403);
    expect((await s.consent()).status).toBe(403);
    expect(s.approved).toEqual([]);
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
    // Strict assistant tool validators reject untyped properties; every top-level property declares a type.
    for (const t of toolDefinitions()) {
      const props = ((t.inputSchema as { properties?: Record<string, Record<string, unknown>> }).properties ?? {});
      for (const [k, v] of Object.entries(props)) expect([t.name, k, 'type' in v || 'anyOf' in v || 'enum' in v]).toEqual([t.name, k, true]);
      expect(t.annotations.readOnlyHint).toBe(t.name.startsWith('get_') || t.name.startsWith('list_') || t.name === 'search_recipes');
    }
    const s = await setup();
    const listed = await s.rpc((await s.token()).access_token, 'tools/list');
    expect(listed.body.result.tools.find((t: { name: string }) => t.name === 'add_recipe')).toMatchObject({ title: 'Add recipe' });
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
  it('builds the Supabase issuer and resource metadata, and validates authorization ids', () => {
    expect(supabaseAuthIssuer('https://ref.supabase.co/')).toBe(AUTH_SERVER);
    expect(protectedResourceMetadata(RESOURCE, AUTH_SERVER).resource).toBe(RESOURCE);
    expect(isAuthorizationId(AUTH_ID)).toBe(true);
    expect(isAuthorizationId('a/b?c')).toBe(false);
    expect(isAuthorizationId('')).toBe(false);
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
    /** Chainable PostgREST-like filter: records `table:filter,filter`, resolves to rows matching household_id. */
    const query = (table: string, applied: string[]): any => ({
      eq: (col: string, val: string) => query(table, [...applied, `${col}=${val}`]),
      is: (col: string, val: null) => query(table, [...applied, `${col} is ${val}`]),
      then: (resolve: (v: unknown) => void) => {
        filters.push(`${table}:${applied.join(',')}`);
        const personal = applied.includes('household_id is null');
        const rows = [row, personalRow].filter((r) => (personal ? r.household_id === null : r.household_id === 'h1'));
        resolve({ data: rows, error: null });
      },
    });
    const personalRow = { ...row, id: 'p1', household_id: null, created_by: 'u1', title: 'My Soup', data: { ...row.data, title: 'My Soup' } };
    const client = {
      from: (table: string) => ({
        select: () => query(table, []),
        upsert: async (rows: unknown[]) => {
          upserts.push(...rows);
          return { error: null };
        },
      }),
    };
    const repo = createSupabaseRepo(client, { householdId: 'h1', userId: 'u1', now: () => NOW });
    const [rec] = await repo.list('recipes');
    expect(rec).toMatchObject({ id: 'r1', title: 'Soup', householdId: 'h1', createdBy: 'u2' });
    expect(filters).toEqual(['recipes:household_id=h1,deleted_at is null']);
    await repo.save('recipes', { ...rec, title: 'Better Soup' });
    expect(upserts[0]).toMatchObject({ id: 'r1', household_id: 'h1', created_by: 'u2', title: 'Better Soup', updated_at: NOW.toISOString() });
    await repo.remove('recipes', 'r1');
    expect(upserts[1]).toMatchObject({ id: 'r1', deleted_at: NOW.toISOString() });

    // No household (v1.0.6): the personal space = household_id IS NULL (RLS: owner_id = the caller).
    const personal = createSupabaseRepo(client, { householdId: null, userId: 'u1', now: () => NOW });
    const mine = await personal.list('recipes');
    expect(mine.map((r) => r.id)).toEqual(['p1']);
    expect(mine[0].householdId).toBeUndefined();
    expect(filters.at(-1)).toBe('recipes:household_id is null,deleted_at is null');
    await personal.save('recipes', { id: 'p2', title: 'New', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() });
    expect(upserts.at(-1)).toMatchObject({ id: 'p2', household_id: null, created_by: 'u1' });

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
