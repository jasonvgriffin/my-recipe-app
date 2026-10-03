/**
 * OAuth for the MCP server (Phase 3). Supabase Auth is the OAuth 2.1 authorization server (PKCE, dynamic client
 * registration, tokens, refresh): `https://<ref>.supabase.co/auth/v1`, discovered at the ROOT-level RFC 8414 URL
 * `https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1`, which Supabase serves itself. An Edge
 * Function cannot serve root-level discovery or real HTML pages, and strict clients (Grok's connector manager)
 * only try the root-level URL, so this server is only the protected resource (RFC 9728) plus the JSON backend
 * of the consent page (`site/oauth/consent.html`, GitHub Pages = Auth Site URL + `/oauth/consent`).
 * Sign-in is the household email-code account, so the assistant acts as the same user under the same RLS.
 */

/** Supabase Auth issuer for a project URL, e.g. https://<ref>.supabase.co → https://<ref>.supabase.co/auth/v1. */
export function supabaseAuthIssuer(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/auth/v1`;
}

/** RFC 9728 protected resource metadata. `resource` must equal the server URL clients connect to. */
export function protectedResourceMetadata(resource: string, authorizationServer: string) {
  return {
    resource,
    authorization_servers: [authorizationServer],
    bearer_methods_supported: ['header'],
    resource_name: 'My Recipe App',
    resource_documentation: 'https://github.com/jasonvgriffin/my-recipe-app/blob/main/docs/MCP.md',
  };
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Supabase OAuth authorization ids are opaque URL-safe strings; reject anything else before using it in a URL. */
export const isAuthorizationId = (s: string) => /^[A-Za-z0-9_-]{8,128}$/.test(s);
