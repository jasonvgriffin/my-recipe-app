/**
 * Tiny URL helpers that don't rely on the global `URL` class: React Native's built-in `URL` is a
 * partial, regex-based polyfill (no validation, custom schemes unsupported), so behavior would differ
 * between Jest/Node and the device.
 */

const URL_RE = /^([a-z][a-z\d+\-.]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i;

export interface ParsedUrl {
  protocol: string; // lower-case, without ':'
  host: string; // lower-case, may include :port, no userinfo
  path: string;
  query: [string, string][];
  hash: string;
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
};

export function parseUrl(input: string): ParsedUrl | undefined {
  const m = input.trim().match(URL_RE);
  if (!m) return undefined;
  const [, protocol, authority, path, search = '', hash = ''] = m;
  const host = authority.replace(/^[^@]*@/, '').toLowerCase();
  const query = search
    .slice(1)
    .split('&')
    .filter(Boolean)
    .map((pair): [string, string] => {
      const i = pair.indexOf('=');
      return i < 0 ? [decode(pair), ''] : [decode(pair.slice(0, i)), decode(pair.slice(i + 1))];
    });
  return { protocol: protocol.toLowerCase(), host, path, query, hash };
}

/** http(s) URL with a plausible host (has a dot or is localhost), no whitespace. */
export function isHttpUrl(input: string): boolean {
  if (/\s/.test(input.trim())) return false;
  const u = parseUrl(input);
  return (
    !!u &&
    (u.protocol === 'http' || u.protocol === 'https') &&
    /^(localhost|[a-z\d-]+(\.[a-z\d-]+)+)(:\d+)?$/i.test(u.host)
  );
}

export function getQueryParam(u: ParsedUrl, key: string): string | undefined {
  return u.query.find(([k]) => k === key)?.[1];
}
