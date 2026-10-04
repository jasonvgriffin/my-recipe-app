import Constants from 'expo-constants';

/**
 * App-wide constants (v1.0.2). Change values here only — screens import them from `@/config`.
 */

/** App version from the app config (`app.json` `expo.version`) via expo-constants — never hardcoded. */
export function appVersion(): string | undefined {
  return Constants.expoConfig?.version ?? undefined;
}
