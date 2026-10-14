import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, useColors } from '@/hooks/use-theme';

export const APP_TITLE = 'My Recipe App';

/** Settings gear glyph. The tab header keeps this width clear so the title cannot cover it. */
export const SETTINGS_GEAR_ICON_SIZE = 22;

/**
 * Space between the gear and the screen edge when the safe-area inset is 0.
 * Design spacing scale (docs/DESIGN.md): 16.
 */
export const HEADER_HORIZONTAL_PADDING = 16;

/**
 * Header title on every main screen: the app name, centered and fairly large, in the top banner (with the settings
 * gear on the right). v1.0.4: the section name is no longer in the banner; `SectionLayout` shows it as a page title
 * just below. Used as `headerTitle` with `headerTitleAlign: 'center'` by the tab layout and the root stack.
 */
export function AppHeaderTitle({ fillWidth = false }: { fillWidth?: boolean }) {
  const styles = useStyles();
  return (
    <View
      pointerEvents={fillWidth ? 'box-none' : 'auto'}
      style={[styles.title, fillWidth && styles.titleFill]}
      testID="app-header">
      <Text
        style={[styles.app, fillWidth && styles.appFill]}
        accessibilityRole="header"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}>
        {APP_TITLE}
      </Text>
    </View>
  );
}

/**
 * v1.0.4 (Jason): the section name (Recipes, Meal Plan, Shopping List, Pantry, More, Settings) as a big,
 * bold, centered page title in the content area just below the banner. Everything on the screen sits under it.
 */
export function SectionTitle({ section }: { section: string }) {
  const styles = useStyles();
  return (
    <Text style={styles.section} accessibilityRole="header" numberOfLines={1} testID="section-title">
      {section}
    </Text>
  );
}

/** Wraps a screen: `SectionTitle` on top, the screen below (used as the navigators' `screenLayout`). */
export function SectionLayout({ section, children }: { section?: string; children: ReactNode }) {
  const styles = useStyles();
  if (!section) return <>{children}</>;
  return (
    <View style={styles.layout} testID="section-layout">
      <SectionTitle section={section} />
      <View style={styles.layout}>{children}</View>
    </View>
  );
}

/** Settings gear (Ionicons `settings-outline`) on the right of every main screen's header. */
export function SettingsGearButton() {
  const styles = useStyles();
  const colors = useColors();
  return (
    <Link href="/settings" asChild>
      <Pressable accessibilityLabel="Settings" hitSlop={12} style={styles.gear} testID="settings-button">
        <Ionicons name="settings-outline" size={SETTINGS_GEAR_ICON_SIZE} color={colors.text} />
      </Pressable>
    </Link>
  );
}

const useStyles = makeStyles((colors) => ({
  title: { alignItems: 'center', justifyContent: 'center' },
  // Tab header only: take the inset title slot so the label shrinks instead of drawing over the gear.
  titleFill: { alignSelf: 'stretch', width: '100%', minWidth: 0, maxWidth: '100%' },
  app: { color: colors.primary, fontSize: 28, lineHeight: 34, fontWeight: '800' },
  appFill: { width: '100%', textAlign: 'center' },
  section: {
    color: colors.text,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  layout: { flex: 1 },
  gear: { paddingHorizontal: HEADER_HORIZONTAL_PADDING },
}));
