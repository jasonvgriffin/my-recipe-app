import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useIncomingUrl } from '@/hooks/use-incoming-url';
import { completeMagicLink, currentAccountUser } from '@/household/runtime';
import { colors } from '@/lib/theme';
import { readMagicLink } from '@/sync';

const MISSING_LINK = 'That sign-in link is incomplete or has expired. Request a new code in Settings → Household.';

/**
 * The full auth redirect URL. Expo Router drops the `#fragment` (where Supabase puts
 * access_token / refresh_token), so prefer the raw linking URL; fall back to the route's query
 * params (`?code=…` PKCE links, `?token=…&email=…`).
 */
export function magicLinkUrlFrom(
  linkingUrl: string | null | undefined,
  params: Record<string, string | string[] | undefined>,
): string | null {
  if (linkingUrl && readMagicLink(linkingUrl)) return linkingUrl;
  const query = Object.entries(params)
    .map(([key, value]) => [key, Array.isArray(value) ? value[0] : value] as const)
    .filter((entry): entry is readonly [string, string] => typeof entry[1] === 'string' && entry[1] !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const rebuilt = `myrecipeapp://auth${query ? `?${query}` : ''}`;
  return readMagicLink(rebuilt) ? rebuilt : null;
}

/**
 * `myrecipeapp://auth` — Supabase email magic-link redirect (spec #25). Completes sign-in with the
 * shared account logic (`readMagicLink` → setSession / exchangeCodeForSession / verifyOtp in
 * `src/sync/supabase.ts`), then opens Settings → Household with a success or error message.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Record<string, string>>();
  const linkingUrl = useIncomingUrl();
  const url = magicLinkUrlFrom(linkingUrl, params);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    if (!url) {
      // The linking URL can arrive a moment after the first render; give it a beat before failing.
      const timer = setTimeout(() => {
        if (handled.current) return;
        handled.current = true;
        router.replace({ pathname: '/household', params: { auth: 'error', message: MISSING_LINK } });
      }, 1500);
      return () => clearTimeout(timer);
    }
    handled.current = true;
    void (async () => {
      let result: { ok: boolean; error?: string };
      try {
        result = await completeMagicLink(url);
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      if (result.ok && !currentAccountUser()) result = { ok: false, error: MISSING_LINK };
      router.replace({
        pathname: '/household',
        params: result.ok
          ? { auth: 'ok' }
          : { auth: 'error', message: result.error || 'Sign-in failed. Request a new code and try again.' },
      });
    })();
    return undefined;
  }, [url, router]);

  return (
    <View testID="auth-callback" style={styles.container}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.text}>Signing you in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: colors.background },
  text: { fontSize: 16, color: colors.text },
});
