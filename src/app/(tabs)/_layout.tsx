import { Link, Tabs } from 'expo-router';
import { Pressable, Text, type ColorValue } from 'react-native';

import { useSettings } from '@/hooks/use-settings';
import { useWindowSizeClass } from '@/hooks/use-window-size-class';
import { colors } from '@/lib/theme';

/**
 * Tabs. RECIPES ARE THE CORE: the app opens to Recipes; Meal plan / Shopping are optional and hidden via
 * Settings (href: null). With every optional feature hidden the tab bar disappears — a pure recipe box.
 * TODO(spec #21): Pantry tab gated by settings.features.pantry.
 */
function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  // Expanded width (unfolded foldable / tablet): navigation moves to a side rail (spec #23).
  const { useNavigationRail } = useWindowSizeClass();
  const { features } = useSettings();
  const anyOptionalTab = features.mealPlan || features.shopping;
  return (
    <Tabs
      screenOptions={{
        tabBarPosition: useNavigationRail ? 'left' : 'bottom',
        tabBarVariant: useNavigationRail ? 'material' : 'uikit',
        tabBarLabelPosition: useNavigationRail ? 'below-icon' : undefined,
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        tabBarStyle: anyOptionalTab
          ? { backgroundColor: colors.card, borderTopColor: colors.border, borderRightColor: colors.border }
          : { display: 'none' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Recipes',
          tabBarIcon: ({ color }) => <TabIcon glyph="🍲" color={color} />,
          headerRight: () => (
            <Link href="/settings" asChild>
              <Pressable
                accessibilityLabel="Settings"
                hitSlop={12}
                style={{ paddingHorizontal: 16 }}
                testID="settings-button">
                <Text style={{ color: colors.text, fontSize: 20 }}>⚙︎</Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="meal-plan"
        options={{
          title: 'Meal plan',
          href: features.mealPlan ? undefined : null,
          tabBarIcon: ({ color }) => <TabIcon glyph="📅" color={color} />,
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          title: 'Shopping list',
          href: features.shopping ? undefined : null,
          tabBarIcon: ({ color }) => <TabIcon glyph="🛒" color={color} />,
        }}
      />
    </Tabs>
  );
}
