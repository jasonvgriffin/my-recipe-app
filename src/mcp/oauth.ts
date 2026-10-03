/**
 * Stateless OAuth 2.1 helpers for the MCP server (Phase 3). Nothing is stored server-side:
 * registered clients, pending authorization requests, authorization codes and tokens are sealed with
 * AES-GCM under a server secret. Sign-in itself is the household email-code account (Supabase OTP), so the
 * assistant acts as the same user, under the same row-level security as the app.
 * Web Crypto only (works in Deno, Node 20+ and jest's node environment).
 */
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type SealKind = 'client' | 'request' | 'code' | 'access' | 'refresh';

export interface Sealer {
  seal(kind: SealKind, payload: Record<string, unknown>, ttlSeconds?: number): Promise<string>;
  /** Returns undefined for anything tampered, expired, or of another kind. */
  open<T extends Record<string, unknown>>(kind: SealKind, token: string): Promise<T | undefined>;
}

export async function createSealer(secret: string, now: () => Date = () => new Date()): Promise<Sealer> {
  if (!secret || secret.length < 16) throw new Error('MCP OAuth secret must be at least 16 characters.');
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`my-recipe-app/mcp/v1:${secret}`));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return {
    async seal(kind, payload, ttlSeconds) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const body = { ...payload, k: kind, ...(ttlSeconds ? { exp: Math.floor(now().getTime() / 1000) + ttlSeconds } : {}) };
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(body))));
      const out = new Uint8Array(iv.length + ct.length);
      out.set(iv);
      out.set(ct, iv.length);
      return b64url(out);
    },
    async open<T extends Record<string, unknown>>(kind: SealKind, token: string) {
      try {
        const bytes = fromB64url(token);
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
        const body = JSON.parse(dec.decode(pt)) as T & { k?: string; exp?: number };
        if (body.k !== kind) return undefined;
        if (typeof body.exp === 'number' && body.exp < Math.floor(now().getTime() / 1000)) return undefined;
        return body;
      } catch {
        return undefined;
      }
    },
  };
}

/** PKCE S256: base64url(sha256(verifier)) === challenge. */
export async function pkceMatches(verifier: string, challenge: string): Promise<boolean> {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier)));
  return b64url(digest) === challenge;
}

/** Redirect URIs allowed at registration: https anywhere, or http on loopback (desktop clients). */
export function isAllowedRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    // Native app schemes (e.g. cursor://, vscode://) are allowed too; never javascript:/data:.
    return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol) && !['javascript:', 'data:', 'file:', 'blob:'].includes(u.protocol);
  } catch {
    return false;
  }
}

export function authorizationServerMetadata(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['recipes'],
  };
}

export function protectedResourceMetadata(issuer: string) {
  return {
    resource: issuer,
    authorization_servers: [issuer],
    scopes_supported: ['recipes'],
    bearer_methods_supported: ['header'],
    resource_name: 'My Recipe App',
  };
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Sign-in page: step 1 asks for the email, step 2 for the 6-digit code from the email. */
export function signInPage(opts: { action: string; request: string; clientName?: string; email?: string; error?: string; info?: string }) {
  const step2 = !!opts.email;
  const who = opts.clientName ? esc(opts.clientName) : 'An AI assistant';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect to My Recipe App</title>
<style>body{font-family:system-ui,sans-serif;background:#16211A;color:#EDEFEA;display:flex;justify-content:center;padding:32px}
main{max-width:420px;width:100%}input,button{font-size:18px;padding:12px;border-radius:10px;width:100%;box-sizing:border-box;margin-top:8px}
input{background:#22302A;color:#EDEFEA;border:1px solid #3A4A42}button{background:#7FB77E;color:#10170F;border:0;font-weight:700;margin-top:16px}
.err{color:#FF8A80}.info{color:#B8C4BC}</style></head><body><main>
<h1>My Recipe App</h1>
<p>${who} wants to read and add recipes, meal plans and shopping lists in your household.</p>
<p class="info">Sign in with the same email you use for household sharing in the app. Your recipes must be synced.</p>
${opts.error ? `<p class="err">${esc(opts.error)}</p>` : ''}${opts.info ? `<p class="info">${esc(opts.info)}</p>` : ''}
<form method="post" action="${esc(opts.action)}">
<input type="hidden" name="request" value="${esc(opts.request)}">
${
  step2
    ? `<input type="hidden" name="email" value="${esc(opts.email!)}"><input type="hidden" name="step" value="verify">
<label>Code sent to ${esc(opts.email!)}<input name="code" inputmode="numeric" autocomplete="one-time-code" required autofocus></label>
<button type="submit">Connect</button>`
    : `<input type="hidden" name="step" value="send"><label>Email<input name="email" type="email" autocomplete="email" required autofocus></label>
<button type="submit">Send code</button>`
}
</form></main></body></html>`;
}
