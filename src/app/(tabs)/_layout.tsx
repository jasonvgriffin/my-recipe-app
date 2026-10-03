import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useState } from 'react';
import { Pressable, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddMenuSheet } from '@/components/add-menu-sheet';
import { AppHeaderTitle, SectionLayout, SettingsGearButton } from '@/components/app-header';
import { BottomBarCoversInsetProvider } from '@/components/layout';
import { useFeatureVisible } from '@/hooks/use-feature';
import { useWindowSizeClass } from '@/hooks/use-window-size-class';
import { makeStyles, useColors } from '@/hooks/use-theme';

/**
 * Tabs (v1.0.2, Cronometer-style): Recipes · Meal Plan · (+) · Shopping · More. RECIPES ARE THE CORE: the app
 * opens to Recipes. Meal Plan and Shopping are optional and drop out (href: null) when the gate locks them or
 * Settings hides them; the + button and More always stay. Pantry lives under More (route kept here so it shows
 * the tab bar). The + button opens `AddMenuSheet` instead of navigating.
 */
/** v1.0.4: section page title shown just below the banner (`SectionLayout`), per tab route. */
const TAB_SECTIONS: Record<string, string> = {
  index: 'Recipes',
  'meal-plan': 'Meal Plan',
  shopping: 'Shopping List',
  more: 'More',
  pantry: 'Pantry',
};

function TabIcon({ name, color }: { name: keyof typeof Ionicons.glyphMap; color: ColorValue }) {
  return <Ionicons name={name} size={22} color={color} />;
}

function PlusTabButton({ onPress, rail }: { onPress: () => void; rail: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.plusSlot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add"
        accessibilityHint="Opens the add menu"
        onPress={onPress}
        style={({ pressed }) => [styles.plus, !rail && styles.plusRaised, pressed && styles.plusPressed]}
        testID="tab-add-button">
        <Ionicons name="add" size={PLUS_ICON} color={colors.accentText} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const colors = useColors();
  // Expanded width (unfolded foldable / tablet): navigation moves to a side rail (spec #23).
  const { useNavigationRail } = useWindowSizeClass();
  // Optional tabs need BOTH the feature gate (paywall-ready, src/entitlements) and the user's Settings toggle.
  const showMealPlan = useFeatureVisible('mealPlan');
  const showShopping = useFeatureVisible('shoppingList');
  const [menuOpen, setMenuOpen] = useState(false);
  // A little taller than the 49dp default so the labels never clip under the raised + (custom height must add the inset).
  const insets = useSafeAreaInsets();
  return (
    <BottomBarCoversInsetProvider value={!useNavigationRail}>
      <Tabs
        screenLayout={({ route, children }) => (
          <SectionLayout section={TAB_SECTIONS[route.name]}>{children}</SectionLayout>
        )}
        screenOptions={{
          tabBarPosition: useNavigationRail ? 'left' : 'bottom',
          tabBarVariant: useNavigationRail ? 'material' : 'uikit',
          tabBarLabelPosition: useNavigationRail ? 'below-icon' : undefined,
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerTitleAlign: 'center',
          headerRight: () => <SettingsGearButton />,
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            borderRightColor: colors.border,
            ...(useNavigationRail ? null : { height: 60 + insets.bottom }),
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          sceneStyle: { backgroundColor: colors.background },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Recipes',
            headerTitle: () => <AppHeaderTitle />,
            tabBarIcon: ({ color }) => <TabIcon name="book-outline" color={color} />,
          }}
        />
        <Tabs.Screen
          name="meal-plan"
          options={{
            title: 'Meal Plan',
            headerTitle: () => <AppHeaderTitle />,
            href: showMealPlan ? undefined : null,
            tabBarIcon: ({ color }) => <TabIcon name="calendar-outline" color={color} />,
          }}
        />
        <Tabs.Screen
          name="add-menu"
          options={{
            title: 'Add',
            tabBarLabel: () => null,
            tabBarButton: () => <PlusTabButton rail={useNavigationRail} onPress={() => setMenuOpen(true)} />,
          }}
          listeners={{ tabPress: (e) => e.preventDefault() }}
        />
        <Tabs.Screen
          name="shopping"
          options={{
            title: 'Shopping',
            headerTitle: () => <AppHeaderTitle />,
            href: showShopping ? undefined : null,
            tabBarIcon: ({ color }) => <TabIcon name="cart-outline" color={color} />,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            headerTitle: () => <AppHeaderTitle />,
            tabBarIcon: ({ color }) => <TabIcon name="ellipsis-horizontal" color={color} />,
          }}
        />
        <Tabs.Screen
          name="pantry"
          options={{ title: 'Pantry', headerTitle: () => <AppHeaderTitle />, href: null }}
        />
      </Tabs>
      <AddMenuSheet visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </BottomBarCoversInsetProvider>
  );
}

// v1.0.4 (Jason): the center + is 33% smaller (≈67% of v1.0.3's 66dp raised / 58dp rail circle and 34dp glyph).
const PLUS_ICON = 23;

const useStyles = makeStyles((colors) => ({
  plusSlot: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 64 },
  plus: {
    width: 39,
    height: 39,
    borderRadius: 19.5,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: colors.shadow,
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  plusRaised: {
    marginTop: -22, // unchanged: keeps the circle centered where v1.0.3's was (scaled about its center, ~3dp raised)
    borderWidth: 3,
    borderColor: colors.background,
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  plusPressed: { opacity: 0.85 },
}));
