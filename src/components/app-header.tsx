import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, useColors } from '@/hooks/use-theme';

export const APP_TITLE = 'My Recipe App';

/**
 * Header title on every main screen: the app name, centered and fairly large, in the top banner (with the settings
 * gear on the right). v1.0.4: the section name is no longer in the banner; `SectionLayout` shows it as a page title
 * just below. Used as `headerTitle` with `headerTitleAlign: 'center'` by the tab layout and the root stack.
 */
export function AppHeaderTitle() {
  const styles = useStyles();
  return (
    <View style={styles.title} testID="app-header">
      <Text style={styles.app} accessibilityRole="header" numberOfLines={1}>
        {APP_TITLE}
      </Text>
    </View>
  );
}

/**
 * v1.0.4 (Jason): the section name (Recipes, Meal Plan, Shopping List, Pantry, More, Settings, Household) as a big,
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
        <Ionicons name="settings-outline" size={22} color={colors.text} />
      </Pressable>
    </Link>
  );
}

const useStyles = makeStyles((colors) => ({
  title: { alignItems: 'center', justifyContent: 'center' },
  app: { color: colors.text, fontSize: 22, lineHeight: 26, fontWeight: '800' },
  section: {
    color: colors.text,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  layout: { flex: 1 },
  gear: { paddingHorizontal: 16 },
}));
