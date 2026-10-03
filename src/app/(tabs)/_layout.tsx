import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

import { colors } from '@/lib/theme';

/** Bottom tabs: Recipes, Meal plan (spec #11), Shopping list (spec #12). */
function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
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
