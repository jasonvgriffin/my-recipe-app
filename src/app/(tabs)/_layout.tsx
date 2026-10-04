import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View, type ColorValue, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddMenuSheet } from '@/components/add-menu-sheet';
import { AppHeaderTitle, SectionLayout, SettingsGearButton } from '@/components/app-header';
import { BottomBarCoversInsetProvider, TAB_BAR, TAB_LABEL_MIN_SCALE } from '@/components/layout';
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

/** Full label, shrinking to fit rather than truncating (v1.0.9). */
function TabLabel({ color, children }: { color: string; children: string }) {
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={TAB_LABEL_MIN_SCALE}
      style={{ color, fontSize: TAB_BAR.label, fontWeight: '600', textAlign: 'center', width: '100%' }}>
      {children}
    </Text>
  );
}

type SlotButtonProps = {
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: ((event: GestureResponderEvent) => void) | null;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  accessibilityLabel?: string;
  'aria-label'?: string;
  'aria-selected'?: boolean;
};

/** Default tab slot with the inner horizontal padding removed (the navigator's own padding is 5). */
function TabSlotButton(props: SlotButtonProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={props.accessibilityLabel ?? props['aria-label']}
      accessibilityState={{ selected: !!props['aria-selected'] }}
      onPress={props.onPress}
      onLongPress={props.onLongPress ?? undefined}
      testID={props.testID}
      style={[props.style, { paddingHorizontal: 0, paddingLeft: 0, paddingRight: 0 }]}>
      {props.children}
    </Pressable>
  );
}

function PlusTabButton({
  onPress,
  rail,
  style,
}: {
  onPress: () => void;
  rail: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View
      style={[
        style,
        rail ? styles.plusSlotRail : styles.plusSlot,
        {
          padding: 0,
          paddingHorizontal: 0,
          paddingLeft: 0,
          paddingRight: 0,
          // `flex: 0` becomes flex-basis 0% on web and collapses the slot. Pin the width instead.
          flexGrow: rail ? undefined : 0,
          flexShrink: rail ? undefined : 0,
          width: rail ? undefined : TAB_BAR.plus,
          minWidth: rail ? undefined : TAB_BAR.plus,
        },
      ]}
      testID="tab-add-slot">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add"
        accessibilityHint="Opens the add menu"
        onPress={onPress}
        style={({ pressed }) => [styles.plus, !rail && styles.plusRaised, pressed && styles.plusPressed]}
        testID="tab-add-button">
        <Ionicons name="add" size={PLUS_ICON} color={colors.primaryText} />
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
          tabBarAllowFontScaling: false,
          tabBarLabel: useNavigationRail
            ? undefined
            : ({ color, children }) => <TabLabel color={String(color)}>{String(children)}</TabLabel>,
          tabBarLabelStyle: useNavigationRail
            ? undefined
            : { fontSize: TAB_BAR.label, fontWeight: '600', paddingHorizontal: 0 },
          tabBarItemStyle: useNavigationRail ? undefined : { paddingHorizontal: 0 },
          tabBarButton: useNavigationRail
            ? undefined
            : (props) => (
                <TabSlotButton
                  onPress={props.onPress as SlotButtonProps['onPress']}
                  onLongPress={props.onLongPress as SlotButtonProps['onLongPress']}
                  testID={props.testID}
                  accessibilityLabel={props.accessibilityLabel}
                  aria-label={props['aria-label']}
                  aria-selected={props['aria-selected']}
                  style={props.style as StyleProp<ViewStyle>}>
                  {props.children}
                </TabSlotButton>
              ),
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
            tabBarButtonTestID: 'tab-recipes',
            tabBarIcon: ({ color }) => <TabIcon name="book-outline" color={color} />,
          }}
        />
        <Tabs.Screen
          name="meal-plan"
          options={{
            title: 'Meal Plan',
            headerTitle: () => <AppHeaderTitle />,
            href: showMealPlan ? undefined : null,
            tabBarButtonTestID: 'tab-meal-plan',
            tabBarIcon: ({ color }) => <TabIcon name="calendar-outline" color={color} />,
          }}
        />
        <Tabs.Screen
          name="add-menu"
          options={{
            title: 'Add',
            tabBarLabel: () => null,
            // The + slot is only as wide as the button. The custom button must apply `style` or the navigator
            // drops `tabBarItemStyle` on the inner slot (v1.0.8 set it; v1.0.9 forwards it).
            // `flex: 0` is flex-basis 0% on web, so a width next to it collapses to 0 and the
            // circle overlaps Shopping. Pin grow, shrink, and basis so the slot stays 58dp.
            tabBarItemStyle: useNavigationRail
              ? undefined
              : {
                  flexGrow: 0,
                  flexShrink: 0,
                  flexBasis: TAB_BAR.plus,
                  width: TAB_BAR.plus,
                  minWidth: TAB_BAR.plus,
                  maxWidth: TAB_BAR.plus,
                  paddingHorizontal: 0,
                },
            tabBarButton: (props) => (
              <PlusTabButton rail={useNavigationRail} style={props.style} onPress={() => setMenuOpen(true)} />
            ),
          }}
          listeners={{ tabPress: (e) => e.preventDefault() }}
        />
        <Tabs.Screen
          name="shopping"
          options={{
            title: 'Shopping',
            headerTitle: () => <AppHeaderTitle />,
            href: showShopping ? undefined : null,
            tabBarButtonTestID: 'tab-shopping',
            tabBarIcon: ({ color }) => <TabIcon name="cart-outline" color={color} />,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            headerTitle: () => <AppHeaderTitle />,
            tabBarButtonTestID: 'tab-more',
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
  plusSlot: { width: TAB_BAR.plus, alignItems: 'center', justifyContent: 'center' },
  plusSlotRail: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  plus: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
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
