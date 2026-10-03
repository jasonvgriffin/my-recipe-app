import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { makeStyles, useColors } from '@/hooks/use-theme';

export const APP_TITLE = 'My Recipe App';

/**
 * Header title on every main screen (v1.0.2): the app name, centered and fairly large, with the current
 * section (Recipes, Meal Plan, Shopping List, Pantry, More, Settings…) centered below it. Used as
 * `headerTitle` with `headerTitleAlign: 'center'` by the tab layout and the root stack.
 */
export function AppHeaderTitle({ section }: { section: string }) {
  const styles = useStyles();
  return (
    <View style={styles.title} testID="app-header">
      <Text style={styles.app} accessibilityRole="header" numberOfLines={1}>
        {APP_TITLE}
      </Text>
      <Text style={styles.section} numberOfLines={1} testID="app-header-section">
        {section}
      </Text>
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
  section: { color: colors.muted, fontSize: 14, lineHeight: 18, fontWeight: '600' },
  gear: { paddingHorizontal: 16 },
}));
