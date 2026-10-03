import type { RecipeImportInput } from './types';
import { getQueryParam, parseUrl } from './url';

/**
 * Map an incoming deep link / share payload to an import input. The app's root layout (or an
 * Android share-intent handler) should call this and then `importRecipe(...)`.
 *
 *   myrecipeapp://import?url=https%3A%2F%2Fexample.com%2Frecipe   -> { kind: 'url' }
 *   myrecipeapp://import?text=...                                   -> { kind: 'text' }
 *
 * TODO(cloud agent): wire `myrecipeapp://import` into expo-router (e.g. src/app/import.tsx) and add an
 * Android SEND intent filter (text/plain) via a config plugin; both must call importRecipe.
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

/** Shared text from the Android share sheet: a bare URL imports the page, anything else is parsed as text. */
export function shareTextToImportInput(shared: string): RecipeImportInput {
  const trimmed = shared.trim();
  return /^https?:\/\/\S+$/.test(trimmed)
    ? { kind: 'url', url: trimmed, source: { channel: 'share-intent' } }
    : { kind: 'text', text: trimmed, source: { channel: 'share-intent' } };
}
