/**
 * Remote MCP server (Phase 3, in v1.0 per Jason, Oct 3 2026): Streamable HTTP (JSON responses, stateless),
 * HTTPS only in production, OAuth 2.1 (PKCE + dynamic client registration) on the household email-code
 * account. Every MCP request: valid token → `mcpAccess` entitlement → per-user rate limit → household lookup.
 * Runtime-neutral `(Request) => Promise<Response>`; the Supabase Edge Function in `supabase/functions/mcp`
 * binds the real dependencies. See docs/MCP.md.
 */
import { canUse as defaultCanUse, type CanUse } from '@/entitlements';

import {
  authorizationServerMetadata,
  isAllowedRedirectUri,
  pkceMatches,
  protectedResourceMetadata,
  signInPage,
  type Sealer,
} from './oauth';
import type { RateLimiter } from './rate-limit';
import type { HouseholdRepo } from './repo';
import { callTool, ToolError, toolDefinitions } from './tools';

export const MCP_SERVER_INFO = { name: 'my-recipe-app', title: 'My Recipe App', version: '1.0.0' } as const;
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const;

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
}

export interface McpAuthBackend {
  /** Email a sign-in code to an EXISTING account (no sign-ups from the MCP page). */
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
  /** The user for a Supabase access token, or undefined if invalid/expired. */
  getUser(accessToken: string): Promise<{ id: string; email?: string } | undefined>;
}

export interface McpServerDeps {
  /** Public base URL of the server, e.g. https://<ref>.supabase.co/functions/v1/mcp (no trailing slash). */
  issuer: string;
  sealer: Sealer;
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
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Retry-After',
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS, ...headers },
  });

const html = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https: http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'",
    },
  });

const oauthError = (error: string, description: string, status = 400) =>
  json({ error, error_description: description }, status);

async function formBody(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)]));
  }
  const text = await req.text();
  return Object.fromEntries(new URLSearchParams(text));
}

interface ClientInfo extends Record<string, unknown> {
  r: string[];
  n?: string;
}
interface PendingRequest extends Record<string, unknown> {
  c: string;
  r: string;
  s?: string;
  ch: string;
  n?: string;
}

export function createMcpHandler(deps: McpServerDeps) {
  const issuer = deps.issuer.replace(/\/+$/, '');
  const issuerPath = new URL(issuer).pathname.replace(/\/+$/, '');
  const canUse = deps.canUse ?? defaultCanUse;
  const now = deps.now ?? (() => new Date());
  const resourceMetadataUrl = `${issuer}/.well-known/oauth-protected-resource`;

  async function tokensFor(session: AuthSession) {
    return {
      access_token: await deps.sealer.seal('access', { at: session.accessToken, u: session.userId }, session.expiresIn),
      token_type: 'Bearer',
      expires_in: session.expiresIn,
      refresh_token: await deps.sealer.seal('refresh', { rt: session.refreshToken }),
      scope: 'recipes',
    };
  }

  async function register(req: Request) {
    const body = (await req.json().catch(() => undefined)) as { redirect_uris?: unknown; client_name?: unknown } | undefined;
    const uris = Array.isArray(body?.redirect_uris) ? body!.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
    if (uris.length === 0 || uris.length > 10 || !uris.every(isAllowedRedirectUri)) {
      return oauthError('invalid_redirect_uri', 'redirect_uris must be https (or http on localhost) URLs.');
    }
    const name = typeof body?.client_name === 'string' ? body.client_name.slice(0, 100) : undefined;
    const clientId = await deps.sealer.seal('client', { r: uris, ...(name ? { n: name } : {}) });
    return json(
      {
        client_id: clientId,
        client_id_issued_at: Math.floor(now().getTime() / 1000),
        redirect_uris: uris,
        ...(name ? { client_name: name } : {}),
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      },
      201,
    );
  }

  async function authorizeStart(url: URL) {
    const p = url.searchParams;
    const client = await deps.sealer.open<ClientInfo>('client', p.get('client_id') ?? '');
    const redirect = p.get('redirect_uri') ?? client?.r[0] ?? '';
    if (!client) return html(signInError('Unknown app. Remove the connector and add it again.'), 400);
    if (!client.r.includes(redirect)) return html(signInError('This redirect address is not registered for the app.'), 400);
    const back = (error: string, description: string) => {
      const to = new URL(redirect);
      to.searchParams.set('error', error);
      to.searchParams.set('error_description', description);
      if (p.get('state')) to.searchParams.set('state', p.get('state')!);
      return Response.redirect(to.toString(), 302);
    };
    if (p.get('response_type') !== 'code') return back('unsupported_response_type', 'Only response_type=code is supported.');
    const challenge = p.get('code_challenge');
    if (!challenge || (p.get('code_challenge_method') ?? 'S256') !== 'S256') {
      return back('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
    }
    const request = await deps.sealer.seal(
      'request',
      { c: p.get('client_id')!, r: redirect, ch: challenge, ...(p.get('state') ? { s: p.get('state')! } : {}), ...(client.n ? { n: client.n } : {}) },
      1800,
    );
    return html(signInPage({ action: `${issuer}/authorize`, request, clientName: client.n }));
  }

  function signInError(message: string) {
    return `<!doctype html><meta charset="utf-8"><title>My Recipe App</title><body style="font-family:system-ui;padding:32px"><h1>Can't connect</h1><p>${message}</p></body>`;
  }

  async function authorizeSubmit(req: Request) {
    const form = await formBody(req);
    const pending = await deps.sealer.open<PendingRequest>('request', form.request ?? '');
    if (!pending) return html(signInError('This sign-in page expired. Start connecting again from your assistant.'), 400);
    const page = (extra: { email?: string; error?: string; info?: string }) =>
      html(signInPage({ action: `${issuer}/authorize`, request: form.request, clientName: pending.n, ...extra }));
    const email = (form.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return page({ error: 'Enter a valid email.' });
    if (form.step !== 'verify') {
      try {
        await deps.auth.sendCode(email);
      } catch {
        return page({ error: 'Could not send a code. Use the email you signed in with in the app (Settings → Household).' });
      }
      return page({ email, info: 'Check your email for a 6-digit code.' });
    }
    let session: AuthSession;
    try {
      session = await deps.auth.verifyCode(email, (form.code ?? '').replace(/\s/g, ''));
    } catch {
      return page({ email, error: 'That code did not work. Check it or send a new one.' });
    }
    if (!canUse('mcpAccess')) return page({ error: 'AI assistant access is not available for this account.' });
    const repo = await deps.connect(session.accessToken, session.userId);
    if (!repo) {
      return page({
        error: 'No household found. In the app, open Settings → Household, create or join a household, and let your recipes sync.',
      });
    }
    const code = await deps.sealer.seal(
      'code',
      { c: pending.c, r: pending.r, ch: pending.ch, at: session.accessToken, rt: session.refreshToken, ei: session.expiresIn, u: session.userId },
      120,
    );
    const to = new URL(pending.r);
    to.searchParams.set('code', code);
    if (pending.s) to.searchParams.set('state', pending.s);
    return Response.redirect(to.toString(), 302);
  }

  async function token(req: Request) {
    const form = await formBody(req);
    if (form.grant_type === 'authorization_code') {
      const code = await deps.sealer.open<{ c: string; r: string; ch: string; at: string; rt: string; ei: number; u: string }>(
        'code',
        form.code ?? '',
      );
      if (!code) return oauthError('invalid_grant', 'Authorization code is invalid or expired.');
      if (form.client_id && form.client_id !== code.c) return oauthError('invalid_grant', 'client_id does not match.');
      if (form.redirect_uri && form.redirect_uri !== code.r) return oauthError('invalid_grant', 'redirect_uri does not match.');
      if (!(await pkceMatches(form.code_verifier ?? '', code.ch))) return oauthError('invalid_grant', 'PKCE verification failed.');
      return json(await tokensFor({ accessToken: code.at, refreshToken: code.rt, expiresIn: code.ei, userId: code.u }));
    }
    if (form.grant_type === 'refresh_token') {
      const rt = await deps.sealer.open<{ rt: string }>('refresh', form.refresh_token ?? '');
      if (!rt) return oauthError('invalid_grant', 'Refresh token is invalid.');
      try {
        return json(await tokensFor(await deps.auth.refresh(rt.rt)));
      } catch {
        return oauthError('invalid_grant', 'Session ended. Connect again.');
      }
    }
    return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token.');
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
    const tok = await deps.sealer.open<{ at: string; u: string }>('access', bearer);
    if (!tok) return unauthorized('Token is invalid or expired.');
    const user = await deps.auth.getUser(tok.at);
    if (!user) return unauthorized('Session expired.');
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
    if (issuerPath && path.startsWith(issuerPath)) path = path.slice(issuerPath.length);
    else path = path.replace(/^.*?\/mcp(?=\/|$)/, '');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      if (req.method === 'GET' && path === '/.well-known/oauth-protected-resource') return json(protectedResourceMetadata(issuer));
      if (req.method === 'GET' && (path === '/.well-known/oauth-authorization-server' || path === '/.well-known/openid-configuration')) {
        return json(authorizationServerMetadata(issuer));
      }
      if (req.method === 'POST' && path === '/register') return await register(req);
      if (req.method === 'GET' && path === '/authorize') return await authorizeStart(url);
      if (req.method === 'POST' && path === '/authorize') return await authorizeSubmit(req);
      if (req.method === 'POST' && path === '/token') return await token(req);
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
