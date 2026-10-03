import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { useWindowSizeClass } from '@/hooks/use-window-size-class';
import { makeStyles } from '@/hooks/use-theme';

/**
 * True inside the bottom tab bar's screens (the bar already sits above the system navigation bar). Provided by
 * `src/app/(tabs)/_layout.tsx`; false for stack screens and when tabs become a side rail (expanded width).
 */
const BottomBarCoversInsetContext = createContext(false);
export const BottomBarCoversInsetProvider = BottomBarCoversInsetContext.Provider;

/**
 * Extra bottom space so the end of a scrolling screen (or a floating button) is never hidden behind the Android
 * navigation bar (gesture pill / 3-button bar) — v1.0.3. 0 inside bottom tabs, else the safe-area bottom inset.
 * Use as `contentContainerStyle={[styles.list, { paddingBottom: 48 + bottomInset }]}`.
 */
export function useBottomInset(): number {
  // Read the context directly (not useSafeAreaInsets) so screens rendered without a SafeAreaProvider get 0.
  const bottom = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  return useContext(BottomBarCoversInsetContext) ? 0 : bottom;
}

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
