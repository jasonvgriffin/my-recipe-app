import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { MAX_CONTENT_WIDTH, MaxWidthContainer } from '@/components/layout';
import { useFeatureVisible } from '@/hooks/use-feature';
import { makeStyles, useColors } from '@/hooks/use-theme';

interface MoreRow {
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: Href;
  testID: string;
}

/**
 * More tab (v1.0.2): Pantry, Household and Settings. Pantry is listed only when the gate allows it and Settings
 * shows it; Household only when household sharing is unlocked. Settings is always here.
 */
export default function MoreScreen() {
  const styles = useStyles();
  const colors = useColors();
  const showPantry = useFeatureVisible('pantry');
  const showHousehold = useFeatureVisible('householdSync');
  const rows: MoreRow[] = [
    ...(showPantry
      ? [
          {
            label: 'Pantry',
            hint: 'What you have on hand',
            icon: 'basket-outline',
            href: '/pantry',
            testID: 'more-pantry',
          } as const,
        ]
      : []),
    ...(showHousehold
      ? [
          {
            label: 'Household',
            hint: 'Share recipes with your household',
            icon: 'people-outline',
            href: '/household',
            testID: 'more-household',
          } as const,
        ]
      : []),
    {
      label: 'Settings',
      hint: 'Units, optional features, AI assistants',
      icon: 'settings-outline',
      href: '/settings',
      testID: 'more-settings',
    },
  ];
  return (
    <ScrollView contentContainerStyle={styles.scroll} testID="more-screen">
      <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.form}>
        <View style={styles.list}>
          {rows.map((row) => (
            <Pressable
              key={row.testID}
              accessibilityRole="button"
              accessibilityHint={row.hint}
              onPress={() => router.push(row.href)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              testID={row.testID}>
              <Ionicons name={row.icon} size={24} color={colors.accent} />
              <View style={styles.flex}>
                <Text style={styles.label}>{row.label}</Text>
                <Text style={styles.hint}>{row.hint}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      </MaxWidthContainer>
    </ScrollView>
  );
}

const useStyles = makeStyles((colors) => ({
  scroll: { padding: 16, flexGrow: 1 },
  list: { gap: 12 },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pressed: { borderColor: colors.primary },
  flex: { flex: 1 },
  label: { color: colors.text, fontSize: 18, fontWeight: '700' },
  hint: { color: colors.muted, marginTop: 2 },
}));
