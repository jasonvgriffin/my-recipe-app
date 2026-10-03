import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { colors, navigationTheme } from '@/lib/theme';
import { configureStepTimerNotifications } from '@/notifications/step-timers';

export default function RootLayout() {
  useEffect(() => {
    configureStepTimerNotifications();
  }, []);
  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="light" />
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
      </Stack>
    </ThemeProvider>
  );
}
