import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { useWindowSizeClass } from '@/hooks/use-window-size-class';
import { colors } from '@/lib/theme';

/** Bottom tabs: Recipes, Meal plan (spec #11), Shopping list (spec #12). */
function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  // Expanded width (unfolded foldable / tablet): navigation moves to a side rail (spec #23).
  const { useNavigationRail } = useWindowSizeClass();
  return (
    <Tabs
      screenOptions={{
        tabBarPosition: useNavigationRail ? 'left' : 'bottom',
        tabBarVariant: useNavigationRail ? 'material' : 'uikit',
        tabBarLabelPosition: useNavigationRail ? 'below-icon' : undefined,
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border, borderRightColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Recipes', tabBarIcon: ({ color }) => <TabIcon glyph="🍲" color={color} /> }}
      />
      <Tabs.Screen
        name="meal-plan"
        options={{ title: 'Meal plan', tabBarIcon: ({ color }) => <TabIcon glyph="📅" color={color} /> }}
      />
      <Tabs.Screen
        name="shopping"
        options={{ title: 'Shopping list', tabBarIcon: ({ color }) => <TabIcon glyph="🛒" color={color} /> }}
      />
    </Tabs>
  );
}
