/**
 * Remote MCP server (Phase 3, in v1.0 per Jason, Oct 3 2026): Streamable HTTP (JSON responses, stateless),
 * HTTPS only in production. OAuth 2.1 is Supabase Auth's OAuth server (see oauth.ts): this server publishes the
 * protected resource metadata, accepts Supabase access tokens, and backs the consent page (email code →
 * approve). Every MCP request: valid token → `mcpAccess` entitlement → per-user rate limit → household lookup.
 * Runtime-neutral `(Request) => Promise<Response>`; the Supabase Edge Function in `supabase/functions/mcp`
 * binds the real dependencies. See docs/MCP.md.
 */
import { canUse as defaultCanUse, type CanUse } from '@/entitlements';

import { isAuthorizationId, isEmail, protectedResourceMetadata } from './oauth';
import type { RateLimiter } from './rate-limit';
import type { HouseholdRepo } from './repo';
import { callTool, ToolError, toolDefinitions } from './tools';

export const MCP_SERVER_INFO = { name: 'my-recipe-app', title: 'My Recipe App', version: '1.0.0' } as const;
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const;

export interface AuthSession {
  accessToken: string;
  userId: string;
}

export interface McpAuthBackend {
  /** Email a sign-in code to an EXISTING account (no sign-ups from the consent page). */
  sendCode(email: string): Promise<void>;
  /** A short-lived session for the consent step only. */
  verifyCode(email: string, code: string): Promise<AuthSession>;
  /** Approve a pending Supabase OAuth authorization as this user; returns the client's redirect URL (with code). */
  approve(authorizationId: string, accessToken: string): Promise<{ redirectUrl: string }>;
  /** End the consent-step session (the OAuth grant keeps its own tokens). */
  endSession?(accessToken: string): Promise<void>;
  /** The user for a Supabase access token (app or OAuth), or undefined if invalid/expired. */
  getUser(accessToken: string): Promise<{ id: string; email?: string } | undefined>;
}

export interface McpServerDeps {
  /** Public URL of the MCP endpoint, e.g. https://<ref>.supabase.co/functions/v1/mcp (no trailing slash). */
  resource: string;
  /** OAuth issuer: Supabase Auth, e.g. https://<ref>.supabase.co/auth/v1. */
  authorizationServer: string;
  auth: McpAuthBackend;
  /** Household data for this user (RLS via their token), or undefined if they are in no household. */
  connect(accessToken: string, userId: string): Promise<HouseholdRepo | undefined>;
  rateLimiter(accessToken: string): RateLimiter;
  fetchHtml: (url: string) => Promise<string>;
  canUse?: CanUse;
  now?: () => Date;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Retry-After, Mcp-Session-Id',
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS, ...headers },
  });

async function jsonBody(req: Request): Promise<Record<string, string>> {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown> | null;
  return Object.fromEntries(Object.entries(body ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v : String(v ?? '')]));
}

export function createMcpHandler(deps: McpServerDeps) {
  const resource = deps.resource.replace(/\/+$/, '');
  const resourcePath = new URL(resource).pathname.replace(/\/+$/, '');
  const canUse = deps.canUse ?? defaultCanUse;
  const now = deps.now ?? (() => new Date());
  const resourceMetadataUrl = `${resource}/.well-known/oauth-protected-resource`;

  /** Consent page step 1: email a code (existing household accounts only). */
  async function consentSend(req: Request) {
    const email = ((await jsonBody(req)).email ?? '').trim().toLowerCase();
    if (!isEmail(email)) return json({ error: 'Enter a valid email.' }, 400);
    try {
      await deps.auth.sendCode(email);
    } catch {
      return json({ error: 'Could not send a code. Use the email you signed in with in the app (Settings → Household).' }, 400);
    }
    return json({ ok: true, email });
  }

  /** Consent page step 2: check the code, entitlement and household, then approve the Supabase authorization. */
  async function consentVerify(req: Request) {
    const form = await jsonBody(req);
    const email = (form.email ?? '').trim().toLowerCase();
    const authorizationId = form.authorization_id ?? '';
    if (!isAuthorizationId(authorizationId)) return json({ error: 'This sign-in link is incomplete. Start connecting again from your assistant.' }, 400);
    if (!isEmail(email)) return json({ error: 'Enter a valid email.' }, 400);
    let session: AuthSession;
    try {
      session = await deps.auth.verifyCode(email, (form.code ?? '').replace(/\s/g, ''));
    } catch {
      return json({ error: 'That code did not work. Check it or send a new one.' }, 400);
    }
    try {
      if (!canUse('mcpAccess')) return json({ error: 'AI assistant access is not available for this account.' }, 403);
      const repo = await deps.connect(session.accessToken, session.userId);
      if (!repo) {
        return json(
          { error: 'No household found. In the app, open Settings → Household, create or join a household, and let your recipes sync.' },
          403,
        );
      }
      try {
        const { redirectUrl } = await deps.auth.approve(authorizationId, session.accessToken);
        return json({ redirect_url: redirectUrl });
      } catch {
        return json({ error: 'This sign-in request expired. Start connecting again from your assistant.' }, 400);
      }
    } finally {
      await deps.auth.endSession?.(session.accessToken).catch(() => undefined);
    }
  }

  const unauthorized = (description: string) =>
    json({ error: 'invalid_token', error_description: description }, 401, {
      'WWW-Authenticate': `Bearer realm="my-recipe-app", resource_metadata="${resourceMetadataUrl}", error="invalid_token", error_description="${description}"`,
    });

  type RpcMessage = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
  const rpcResult = (id: RpcMessage['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result });
  const rpcError = (id: RpcMessage['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

  async function mcp(req: Request) {
    const auth = req.headers.get('authorization') ?? '';
    const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) return unauthorized('Sign in required.');
    const user = await deps.auth.getUser(bearer);
    if (!user) return unauthorized('Token is invalid or expired.');
    const tok = { at: bearer };
    if (!canUse('mcpAccess')) return json(rpcError(null, -32001, 'AI assistant access is not available for this account.'), 403);
    const limit = await deps.rateLimiter(tok.at).hit(user.id);
    if (!limit.ok) {
      return json(rpcError(null, -32029, 'Rate limit exceeded. Try again later.'), 429, { 'Retry-After': String(limit.retryAfter ?? 60) });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(rpcError(null, -32700, 'Parse error'), 400);
    }
    let repo: HouseholdRepo | undefined | null = null;
    const getRepo = async () => {
      if (repo === null) repo = await deps.connect(tok.at, user.id);
      return repo;
    };

    const handle = async (msg: RpcMessage): Promise<object | undefined> => {
      if (!msg || typeof msg !== 'object' || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Invalid request');
      const isNotification = msg.id === undefined;
      switch (msg.method) {
        case 'initialize': {
          const asked = String(msg.params?.protocolVersion ?? '');
          const version = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : SUPPORTED_PROTOCOL_VERSIONS[1];
          return rpcResult(msg.id, {
            protocolVersion: version,
            capabilities: { tools: { listChanged: false } },
            serverInfo: MCP_SERVER_INFO,
            instructions:
              "Jason's household recipe box. Search, read, add and edit recipes; plan meals; manage the shopping list. " +
              'Allulose is the only sugar-free sweetener (never monk fruit). This is a recipe app, not a nutrition app: no nutrition data.',
          });
        }
        case 'ping':
          return rpcResult(msg.id, {});
        case 'tools/list':
          return rpcResult(msg.id, { tools: toolDefinitions() });
        case 'tools/call': {
          const r = await getRepo();
          if (!r) {
            return rpcResult(msg.id, {
              content: [{ type: 'text', text: 'No household found. In the app: Settings → Household → create or join, then sync.' }],
              isError: true,
            });
          }
          try {
            const out = await callTool(String(msg.params?.name ?? ''), msg.params?.arguments, { repo: r, fetchHtml: deps.fetchHtml, now });
            return rpcResult(msg.id, { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structuredContent: out });
          } catch (e) {
            const message = e instanceof ToolError ? e.message : 'Something went wrong. Try again.';
            return rpcResult(msg.id, { content: [{ type: 'text', text: message }], isError: true });
          }
        }
        default:
          if (isNotification) return undefined;
          return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
      }
    };

    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map((m) => handle(m as RpcMessage)))).filter(Boolean);
      return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
    }
    const out = await handle(body as RpcMessage);
    return out ? json(out) : new Response(null, { status: 202, headers: CORS });
  }

  return async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    let path = url.pathname.replace(/\/+$/, '');
    // Accept both the public path (/functions/v1/mcp/...) and the function-local one (/mcp/...).
    if (resourcePath && path.startsWith(resourcePath)) path = path.slice(resourcePath.length);
    else path = path.replace(/^.*?\/mcp(?=\/|$)/, '');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      if (req.method === 'GET' && path.startsWith('/.well-known/oauth-protected-resource')) {
        return json(protectedResourceMetadata(resource, deps.authorizationServer));
      }
      if (req.method === 'POST' && path === '/consent/send') return await consentSend(req);
      if (req.method === 'POST' && path === '/consent/verify') return await consentVerify(req);
      if (path === '' || path === '/' || path === '/mcp') {
        if (req.method === 'POST') return await mcp(req);
        return json({ error: 'method_not_allowed', error_description: 'Use POST (Streamable HTTP, JSON responses).' }, 405, { Allow: 'POST' });
      }
      return json({ error: 'not_found' }, 404);
    } catch {
      return json({ error: 'server_error' }, 500);
    }
  };
}
