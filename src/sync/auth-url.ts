import { parseUrl } from '@/import/url';

/** Tokens a Supabase email magic link may place on `myrecipeapp://auth`. */
export interface MagicLinkParams {
  accessToken?: string;
  refreshToken?: string;
  code?: string;
  token?: string;
  email?: string;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function parsePairs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of raw.split('&')) {
    if (!pair) continue;
    const index = pair.indexOf('=');
    const key = decode(index < 0 ? pair : pair.slice(0, index));
    const value = decode(index < 0 ? '' : pair.slice(index + 1));
    if (key) out[key] = value;
  }
  return out;
}

/**
 * Read a magic-link redirect. Returns null when `url` is not an auth callback
 * (so ordinary recipe deep links are ignored).
 */
export function readMagicLink(url: string): MagicLinkParams | null {
  const parsed = parseUrl(url.trim());
  if (!parsed) return null;
  const path = parsed.path.replace(/^\//, '');
  const isAuth = parsed.host === 'auth' || path === 'auth' || path.endsWith('/auth');
  const hash = parsePairs(parsed.hash.replace(/^#/, ''));
  const query = Object.fromEntries(parsed.query);
  const accessToken = hash.access_token || query.access_token || undefined;
  const refreshToken = hash.refresh_token || query.refresh_token || undefined;
  const code = hash.code || query.code || undefined;
  const token = hash.token || query.token || undefined;
  const email = hash.email || query.email || undefined;
  if (!isAuth && !accessToken && !code) return null;
  if (!accessToken && !refreshToken && !code && !token) return null;
  return { accessToken, refreshToken, code, token, email };
}
