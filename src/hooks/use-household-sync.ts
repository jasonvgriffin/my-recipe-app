import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { completeMagicLink, requestHouseholdSync, startHouseholdRuntime } from '@/household/runtime';

/**
 * App-wide sync triggers: cold start, return to foreground, and the optional magic-link redirect
 * (`myrecipeapp://auth`). Safe when Supabase is not configured — the app stays solo.
 */
export function useHouseholdSync(): void {
  useEffect(() => {
    startHouseholdRuntime();
    const app = AppState.addEventListener('change', (next) => {
      if (next === 'active') requestHouseholdSync('foreground');
    });
    let removeLink = () => {};
    if (typeof Linking.addEventListener === 'function') {
      const sub = Linking.addEventListener('url', ({ url }) => {
        void completeMagicLink(url);
      });
      removeLink = () => sub.remove();
    }
    void Linking.getInitialURL?.().then((url) => {
      if (url) void completeMagicLink(url);
    });
    return () => {
      app.remove();
      removeLink();
    };
  }, []);
}
