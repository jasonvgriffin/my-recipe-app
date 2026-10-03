import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useWindowSizeClass } from '@/hooks/use-window-size-class';
import { makeStyles } from '@/hooks/use-theme';

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
