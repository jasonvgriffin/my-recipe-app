import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useState } from 'react';
import { Pressable, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddMenuSheet } from '@/components/add-menu-sheet';
import { AppHeaderTitle, SectionLayout, SettingsGearButton } from '@/components/app-header';
import { BottomBarCoversInsetProvider, TAB_BAR } from '@/components/layout';
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
  return <Ionicons name={name} size={TAB_BAR.icon} color={color} />;
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
            ...(useNavigationRail ? null : { height: TAB_BAR.height + insets.bottom, paddingTop: 6 }),
          },
          tabBarLabelStyle: useNavigationRail ? undefined : { fontSize: TAB_BAR.label, fontWeight: '600' },
          tabBarIconStyle: useNavigationRail ? undefined : { width: TAB_BAR.icon + 4, height: TAB_BAR.icon + 2 },
          // Forms (e.g. Pantry Save / Cancel / Remove) keep the whole screen above the keyboard.
          tabBarHideOnKeyboard: true,
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

// v1.0.4 made the + 33% smaller; v1.0.7 scales it back up with the rest of the bar (44→58dp, glyph 23→31dp).
const PLUS_ICON = TAB_BAR.plusIcon;

const useStyles = makeStyles((colors) => ({
  plusSlot: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 72 },
  plus: {
    width: 52,
    height: 52,
    borderRadius: 26,
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
    marginTop: -29, // scaled with the circle (v1.0.4: -22 for 44dp), so it sits just as raised
    borderWidth: 3,
    borderColor: colors.background,
    width: TAB_BAR.plus,
    height: TAB_BAR.plus,
    borderRadius: TAB_BAR.plus / 2,
  },
  plusPressed: { opacity: 0.85 },
}));
