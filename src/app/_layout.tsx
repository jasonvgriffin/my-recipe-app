import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useHouseholdSync } from '@/hooks/use-household-sync';
import { colors, navigationTheme } from '@/lib/theme';

function HouseholdSyncHost() {
  useHouseholdSync();
  return null;
}

export default function RootLayout() {
  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="light" />
      <HouseholdSyncHost />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="add" options={{ title: 'Add Recipe', presentation: 'modal' }} />
        <Stack.Screen name="recipe/[id]" options={{ title: 'Recipe' }} />
        <Stack.Screen name="cook/[action]" options={{ title: 'Cook with me' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="household" options={{ title: 'Household' }} />
      </Stack>
    </ThemeProvider>
  );
}
