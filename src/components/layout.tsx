import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { useWindowSizeClass } from '@/hooks/use-window-size-class';
import { makeStyles } from '@/hooks/use-theme';

/**
 * True inside the bottom tab bar's screens. Provided by `src/app/(tabs)/_layout.tsx`; false for stack screens and
 * when tabs become a side rail (expanded width).
 */
const BottomBarCoversInsetContext = createContext(false);
export const BottomBarCoversInsetProvider = BottomBarCoversInsetContext.Provider;

/** True when `SystemNavFrame` already padded this screen by the system navigation-bar inset. */
const FrameClearsInsetContext = createContext(false);

/**
 * Extra padding inside bottom-tab scenes. The tab bar is in normal flow (not absolute), so the scene
 * already ends above it. This only clears the raised center + button (~29dp overlap).
 */
export const TAB_PLUS_CLEARANCE = 32;

/**
 * Extra bottom space for scroll content and floating buttons (v1.0.3, extended in v1.0.8).
 *
 * - Inside a bottom tab bar: `TAB_PLUS_CLEARANCE` only. Do not add the bar height or the system inset —
 *   the bar is already in flow, and adding them lifts absolute controls (the recipe selection bar) far
 *   above the bar.
 * - Inside `SystemNavFrame`: 0. The frame already ends the viewport above the system navigation bar, so
 *   scroll padding must not add that inset again.
 * - Otherwise: the safe-area bottom inset (stack screens rendered without the frame, and the side rail).
 *
 * Use as `contentContainerStyle={[styles.list, { paddingBottom: 48 + bottomInset }]}`.
 */
export function useBottomInset(): number {
  // Read the context directly (not useSafeAreaInsets) so screens rendered without a SafeAreaProvider get 0.
  // Hooks stay unconditional — the early returns are on the values, not the calls.
  const bottom = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const frameClears = useContext(FrameClearsInsetContext);
  const tabBarCovers = useContext(BottomBarCoversInsetContext);
  if (frameClears) return 0;
  if (tabBarCovers) return TAB_PLUS_CLEARANCE;
  return bottom;
}

/**
 * Pads a stack screen so its whole viewport — not only the end of the scroll — sits above the Android
 * system navigation bar (v1.0.8). One place for every stack screen, via the root `screenLayout`.
 * Tab scenes skip this: the bar is in normal flow, so the scene already ends above it.
 */
export function SystemNavFrame({ children }: { children: ReactNode }) {
  const bottom = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  return (
    <FrameClearsInsetContext.Provider value>
      <View style={{ flex: 1, paddingBottom: bottom }} testID="system-nav-frame">
        {children}
      </View>
    </FrameClearsInsetContext.Provider>
  );
}

/**
 * v1.0.7 (Jason): the bottom bar is ~33% bigger — bar height, icons, labels and the + scale together
 * (60→80dp bar, 22→29dp icons, 10→13sp labels, 44→58dp +). The bar adds the safe-area bottom inset so it stays
 * clear of the gesture pill / 3-button nav bar. The bar is in normal flow; tab scenes add `TAB_PLUS_CLEARANCE`
 * (`useBottomInset`) so content and floating buttons clear the raised +, not the whole bar.
 */
export const TAB_BAR = { height: 80, icon: 29, label: 13, plus: 58, plusIcon: 31 } as const;

/** Max readable widths so content never stretches across a wide unfolded screen / hinge (spec #23). */
export const MAX_CONTENT_WIDTH = { text: 720, list: 560, form: 640 } as const;

/** Centers children and caps their width. Use as the root of every single-pane screen body. */
export function MaxWidthContainer({
  children,
  maxWidth = MAX_CONTENT_WIDTH.text,
  style,
}: {
  children: ReactNode;
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  return (
    <View style={[styles.maxOuter]}>
      <View style={[styles.maxInner, { maxWidth }, style]}>{children}</View>
    </View>
  );
}

export interface TwoPaneLayoutProps {
  /** List / master pane (recipe list, calendar, shopping list, ingredients...). */
  primary: ReactNode;
  /** Detail pane. null/undefined shows `placeholder` in two-pane mode. */
  secondary?: ReactNode | null;
  /** Shown in the secondary pane when nothing is selected. */
  placeholder?: ReactNode;
  /**
   * Compact behavior: 'primary' (default) renders only the primary pane — navigate to a detail route for
   * the secondary content; 'stack' renders primary above secondary (e.g. cooking mode on a phone).
   */
  compact?: 'primary' | 'stack';
  /** Primary pane width in two-pane mode (dp). Default 360 (medium) / 400 (expanded). */
  primaryWidth?: number;
  testID?: string;
}

/**
 * Reusable list-detail layout (spec #23). Compact: single pane. Medium/expanded: side-by-side panes
 * with a divider; the secondary pane's content is width-capped so it never spans the hinge.
 * Re-layouts live on fold/unfold; state lives in the parent so nothing is lost.
 */
export function TwoPaneLayout({
  primary,
  secondary,
  placeholder,
  compact = 'primary',
  primaryWidth,
  testID = 'two-pane-layout',
}: TwoPaneLayoutProps) {
  const styles = useStyles();
  const { isTwoPane, sizeClass } = useWindowSizeClass();
  const width = primaryWidth ?? (sizeClass === 'expanded' ? 400 : 360);

  // The primary pane keeps the same position in the tree in every mode, so folding/unfolding
  // re-lays it out without remounting (scroll position, inputs and state survive).
  return (
    <View style={isTwoPane ? styles.row : styles.fill} testID={`${testID}-${isTwoPane ? 'dual' : 'single'}`}>
      <View
        style={isTwoPane ? [styles.primary, { width }] : compact === 'stack' && secondary ? undefined : styles.fill}
        testID={`${testID}-primary`}>
        {primary}
      </View>
      {isTwoPane ? (
        <View style={styles.secondary} testID={`${testID}-secondary`}>
          <View style={styles.secondaryInner}>
            {secondary ?? placeholder ?? <Text style={styles.placeholder}>Select an item</Text>}
          </View>
        </View>
      ) : compact === 'stack' && secondary ? (
        <View style={styles.fill} testID={`${testID}-secondary`}>
          {secondary}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  fill: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  primary: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border },
  secondary: { flex: 1, alignItems: 'center' },
  secondaryInner: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH.text },
  placeholder: { color: colors.muted, textAlign: 'center', marginTop: 48 },
  maxOuter: { flex: 1, alignItems: 'center' },
  maxInner: { flex: 1, width: '100%' },
}));
