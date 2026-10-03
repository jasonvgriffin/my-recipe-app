import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useHouseholdSync } from '@/hooks/use-household-sync';
import { colors, navigationTheme } from '@/lib/theme';
import { configureStepTimerNotifications } from '@/notifications/step-timers';
import { recipeStore } from '@/storage/recipes';

function HouseholdSyncHost() {
  useHouseholdSync();
  return null;
}

export default function RootLayout() {
  useEffect(() => {
    configureStepTimerNotifications();
    // No sample recipes any more (v1.0.1): drop untouched v1.0.0 samples from old installs, once.
    recipeStore.removeUntouchedSamples().catch(() => undefined);
  }, []);
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
        <Stack.Screen name="import" options={{ title: 'Import recipe', presentation: 'modal' }} />
        <Stack.Screen name="recipe/[id]/index" options={{ title: 'Recipe' }} />
        <Stack.Screen name="recipe/[id]/edit" options={{ title: 'Edit recipe' }} />
        <Stack.Screen name="cook/[action]" options={{ title: 'Cook with me' }} />
        <Stack.Screen name="meal-plan/[date]" options={{ title: 'Meal plan' }} />
        <Stack.Screen name="grocery-run" options={{ title: 'Grocery run' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="household" options={{ title: 'Household' }} />
        <Stack.Screen name="pantry/scan" options={{ title: 'Scan barcode' }} />
        <Stack.Screen name="shopping/scan" options={{ title: 'Scan barcode' }} />
        <Stack.Screen name="recipes" options={{ title: 'Existing Recipes' }} />
        <Stack.Screen name="pantry-match" options={{ title: 'What can I make?' }} />
      </Stack>
    </ThemeProvider>
  );
}
