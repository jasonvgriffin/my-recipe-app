import * as Linking from 'expo-linking';

/**
 * The raw URL that opened the app (initial link, then later links). Unlike Expo Router's params it
 * keeps the `#fragment`, where Supabase magic links carry their tokens. Wrapped so tests can stub it.
 */
export function useIncomingUrl(): string | null {
  return Linking.useLinkingURL();
}
