import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AppHeaderTitle, SectionLayout } from '@/components/app-header';
import { useHouseholdSync } from '@/hooks/use-household-sync';
import { AppThemeProvider, useColorSchemeResolved, useColors, useNavigationTheme } from '@/hooks/use-theme';
import { configureStepTimerNotifications } from '@/notifications/step-timers';
import { recipeStore } from '@/storage/recipes';

/** v1.0.4: section page title below the banner for the stack screens that show the app header. */
const STACK_SECTIONS: Record<string, string> = { settings: 'Settings', household: 'Household', account: 'AI assistants', backup: 'Backup & restore' };

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
    <AppThemeProvider>
      <ThemedRoot />
    </AppThemeProvider>
  );
}

/** Navigator + status bar themed from Settings → Appearance (v1.0.3). */
function ThemedRoot() {
  const colors = useColors();
  const scheme = useColorSchemeResolved();
  const navigationTheme = useNavigationTheme();
  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <HouseholdSyncHost />
      <Stack
        screenLayout={({ route, children }) => (
          <SectionLayout section={STACK_SECTIONS[route.name]}>{children}</SectionLayout>
        )}
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
        <Stack.Screen name="grocery-run" options={{ title: 'Shopping List' }} />
        <Stack.Screen
          name="settings"
          options={{
            title: 'Settings',
            headerTitleAlign: 'center',
            headerTitle: () => <AppHeaderTitle />,
          }}
        />
        <Stack.Screen
          name="household"
          options={{
            title: 'Household',
            headerTitleAlign: 'center',
            headerTitle: () => <AppHeaderTitle />,
          }}
        />
        <Stack.Screen
          name="account"
          options={{
            title: 'AI assistants',
            headerTitleAlign: 'center',
            headerTitle: () => <AppHeaderTitle />,
          }}
        />
        <Stack.Screen
          name="backup"
          options={{
            title: 'Backup & restore',
            headerTitleAlign: 'center',
            headerTitle: () => <AppHeaderTitle />,
          }}
        />
        <Stack.Screen name="auth" options={{ title: 'Signing in' }} />
        <Stack.Screen name="pantry/scan" options={{ title: 'Scan barcode' }} />
        <Stack.Screen name="shopping/scan" options={{ title: 'Scan barcode' }} />
        <Stack.Screen name="recipes" options={{ title: 'Existing Recipes' }} />
        <Stack.Screen name="pantry-match" options={{ title: 'What can I make?' }} />
      </Stack>
    </ThemeProvider>
  );
}
