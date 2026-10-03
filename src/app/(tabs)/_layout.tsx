import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, Tabs } from 'expo-router';
import { Pressable, Text, type ColorValue } from 'react-native';

import { useFeatureVisible } from '@/hooks/use-feature';
import { useWindowSizeClass } from '@/hooks/use-window-size-class';
import { colors } from '@/lib/theme';

/**
 * Tabs. RECIPES ARE THE CORE: the app opens to Recipes; Meal plan / Shopping are optional and hidden via
 * Settings (href: null). With every optional feature hidden the tab bar disappears — a pure recipe box.
 * Pantry is optional too (spec #21): hidden unless the gate allows it and Settings → Pantry is on.
 */
function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  // Expanded width (unfolded foldable / tablet): navigation moves to a side rail (spec #23).
  const { useNavigationRail } = useWindowSizeClass();
  // Optional tabs need BOTH the feature gate (paywall-ready, src/entitlements) and the user's Settings toggle.
  const showMealPlan = useFeatureVisible('mealPlan');
  const showShopping = useFeatureVisible('shoppingList');
  const showPantry = useFeatureVisible('pantry');
  const anyOptionalTab = showMealPlan || showShopping || showPantry;
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
                <Ionicons name="settings-outline" size={22} color={colors.text} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="meal-plan"
        options={{
          title: 'Meal plan',
          href: showMealPlan ? undefined : null,
          tabBarIcon: ({ color }) => <TabIcon glyph="📅" color={color} />,
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          title: 'Shopping list',
          href: showShopping ? undefined : null,
          tabBarIcon: ({ color }) => <TabIcon glyph="🛒" color={color} />,
        }}
      />
      <Tabs.Screen
        name="pantry"
        options={{
          title: 'Pantry',
          href: showPantry ? undefined : null,
          tabBarIcon: ({ color }) => <TabIcon glyph="🥫" color={color} />,
        }}
      />
    </Tabs>
  );
}
