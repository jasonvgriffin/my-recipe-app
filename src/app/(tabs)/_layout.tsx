import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useState } from 'react';
import { Pressable, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddMenuSheet } from '@/components/add-menu-sheet';
import { AppHeaderTitle, SettingsGearButton } from '@/components/app-header';
import { useFeatureVisible } from '@/hooks/use-feature';
import { useWindowSizeClass } from '@/hooks/use-window-size-class';
import { makeStyles, useColors } from '@/hooks/use-theme';

/**
 * Tabs (v1.0.2, Cronometer-style): Recipes · Meal Plan · (+) · Shopping · More. RECIPES ARE THE CORE: the app
 * opens to Recipes. Meal Plan and Shopping are optional and drop out (href: null) when the gate locks them or
 * Settings hides them; the + button and More always stay. Pantry lives under More (route kept here so it shows
 * the tab bar). The + button opens `AddMenuSheet` instead of navigating.
 */
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
        <Ionicons name="add" size={34} color={colors.accentText} />
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
    <>
      <Tabs
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
            headerTitle: () => <AppHeaderTitle section="Recipes" />,
            tabBarIcon: ({ color }) => <TabIcon name="book-outline" color={color} />,
          }}
        />
        <Tabs.Screen
          name="meal-plan"
          options={{
            title: 'Meal Plan',
            headerTitle: () => <AppHeaderTitle section="Meal Plan" />,
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
            headerTitle: () => <AppHeaderTitle section="Shopping List" />,
            href: showShopping ? undefined : null,
            tabBarIcon: ({ color }) => <TabIcon name="cart-outline" color={color} />,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            headerTitle: () => <AppHeaderTitle section="More" />,
            tabBarIcon: ({ color }) => <TabIcon name="ellipsis-horizontal" color={color} />,
          }}
        />
        <Tabs.Screen
          name="pantry"
          options={{ title: 'Pantry', headerTitle: () => <AppHeaderTitle section="Pantry" />, href: null }}
        />
      </Tabs>
      <AddMenuSheet visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  plusSlot: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 64 },
  plus: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: colors.shadow,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  plusRaised: {
    marginTop: -22,
    borderWidth: 4,
    borderColor: colors.background,
    width: 66,
    height: 66,
    borderRadius: 33,
  },
  plusPressed: { opacity: 0.85 },
}));
