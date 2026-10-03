// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', 'supabase/functions/**'],
  },
  {
    // The import pipeline, cook-with-me session and sync engine must stay UI-free and storage-agnostic so a future MCP server / sync worker
    // can reuse it. Only index.ts / app-deps.ts bind the on-device store. See docs/IMPORT_API.md.
    files: [
      'src/import/**/*.ts',
      'src/cooking/**/*.ts',
      'src/sync/**/*.ts',
      'src/pantry/**/*.ts',
      'src/receipts/**/*.ts',
      'src/entitlements/**/*.ts',
      'src/mcp/**/*.ts',
    ],
    ignores: ['src/import/index.ts', 'src/import/app-deps.ts', 'src/cooking/index.ts', 'src/sync/index.ts', 'src/sync/supabase.ts', 'src/pantry/index.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['react', 'react-native', 'expo-router', '@react-native-async-storage/async-storage'],
          patterns: [
            { group: ['@/app/*', 'expo-*', 'react-native-*'], message: 'src/import must not depend on UI code.' },
            { group: ['@/storage/*', '!@/storage/recipes', '!@/storage/kv'], message: 'Inject storage via deps.' },
          ],
        },
      ],
    },
  },
]);
