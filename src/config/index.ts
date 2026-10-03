import Constants from 'expo-constants';

/**
 * App-wide constants (v1.0.2). Change values here only — screens import them from `@/config`.
 */

/** Remote MCP server (spec #28, docs/MCP.md) that AI assistants (Grok, Claude, ChatGPT…) connect to. */
export const MCP_SERVER_URL = 'https://krqmumdgsfimasjawxqn.supabase.co/functions/v1/mcp';

/** App version from the app config (`app.json` `expo.version`) via expo-constants — never hardcoded. */
export function appVersion(): string | undefined {
  return Constants.expoConfig?.version ?? undefined;
}
