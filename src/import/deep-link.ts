import type { RecipeImportInput } from './types';
import { getQueryParam, parseUrl } from './url';

/**
 * Map an incoming deep link / share payload to an import input. The import screen
 * (`src/app/import.tsx`) and `+native-intent` call these, then `importRecipe(...)`.
 *
 *   myrecipeapp://import?url=https%3A%2F%2Fexample.com%2Frecipe   -> { kind: 'url' }
 *   myrecipeapp://import?text=...                                   -> { kind: 'text' }
 *   myrecipeapp://expo-sharing                                      -> import screen (Android SEND)
 */
export function parseImportDeepLink(link: string): RecipeImportInput | undefined {
  const u = parseUrl(link);
  if (!u || u.protocol !== 'myrecipeapp') return undefined;
  const target = (u.host + u.path).replace(/\/+$/, '').replace(/^\/+/, '');
  if (target !== 'import') return undefined;
  const url = getQueryParam(u, 'url');
  if (url) return { kind: 'url', url, source: { channel: 'deep-link' } };
  const text = getQueryParam(u, 'text');
  if (text) return { kind: 'text', text, source: { channel: 'deep-link' } };
  return undefined;
}

const URL_IN_TEXT = /https?:\/\/\S+/g;

/**
 * Shared text from the Android share sheet.
 * A bare URL, or a short caption plus a single URL (how Chrome shares a page), imports the page.
 * Anything that looks like a recipe body is parsed as text.
 */
export function shareTextToImportInput(shared: string): RecipeImportInput {
  const trimmed = shared.trim();
  if (/^https?:\/\/\S+$/.test(trimmed)) {
    return { kind: 'url', url: trimmed, source: { channel: 'share-intent' } };
  }
  const urls = trimmed.match(URL_IN_TEXT) ?? [];
  const withoutUrls = trimmed.replace(URL_IN_TEXT, '').trim();
  const looksLikeRecipe = /ingredients?|steps?|instructions?|directions?|method/i.test(withoutUrls);
  if (urls.length === 1 && !looksLikeRecipe && withoutUrls.length < 200) {
    const url = urls[0].replace(/[)\].,]+$/, '');
    return {
      kind: 'url',
      url,
      source: { channel: 'share-intent', label: withoutUrls || undefined },
    };
  }
  return { kind: 'text', text: trimmed, source: { channel: 'share-intent' } };
}

/** Text or URL value from an expo-sharing incoming payload, if the app can import it. */
export function sharedPayloadToText(
  payloads: readonly { shareType?: string; value?: string; contentType?: string | null }[],
): string | undefined {
  for (const payload of payloads) {
    const value = payload.value?.trim();
    if (!value) continue;
    const kind = payload.shareType ?? payload.contentType ?? 'text';
    if (kind === 'text' || kind === 'url' || kind === 'website') return value;
  }
  return undefined;
}

/**
 * Expo Router `redirectSystemPath` helper. Android SEND (expo-sharing) opens
 * `myrecipeapp://expo-sharing`; send the user to the import draft screen.
 * Every other path is unchanged.
 */
export function importPathFromIncomingUrl(path: string): string {
  const parsed = parseUrl(path);
  const host = parsed?.host ?? '';
  const bare = path.replace(/^[a-z][a-z\d+\-.]*:\/\//i, '').replace(/^\/+/, '');
  if (host === 'expo-sharing' || bare === 'expo-sharing' || bare.startsWith('expo-sharing?')) {
    return '/import?incoming=1';
  }
  return path;
}
