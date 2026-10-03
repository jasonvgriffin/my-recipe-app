import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { MaxWidthContainer, MAX_CONTENT_WIDTH } from '@/components/layout';
import { FeatureGate } from '@/components/feature-gate';
import { featureGate, type FeatureId } from '@/entitlements';
import { useFeature } from '@/hooks/use-feature';
import { useHousehold } from '@/hooks/use-household';
import { useSettings } from '@/hooks/use-settings';
import { colors } from '@/lib/theme';
import { settingsStore } from '@/storage/settings';
import { syncStatusLabel } from '@/sync/status';
import type { OptionalFeatures } from '@/types/recipe';

const FEATURES: { key: keyof OptionalFeatures; gate: FeatureId; label: string; help: string }[] = [
  { key: 'mealPlan', gate: 'mealPlan', label: 'Meal plan', help: 'Plan recipes on a calendar.' },
  {
    key: 'shopping',
    gate: 'shoppingList',
    label: 'Shopping list',
    help: 'Lists built from your meal plan, grocery run mode.',
  },
  { key: 'pantry', gate: 'pantry', label: 'Pantry', help: 'Track what you have, barcode & receipt scanning.' },
];

/**
 * Settings. Recipes are the core: everything here is optional. Turning all features off makes the app a
 * pure recipe box. TODO(spec #16): units.
 */
function HouseholdSettingsLink() {
  const { account, sync } = useHousehold();
  const subtitle = !account.user
    ? 'Share recipes with your household. Optional — recipes work without an account.'
    : account.household
      ? `${account.household.name} · ${syncStatusLabel(sync)}`
      : 'Signed in, not in a household yet.';
  return (
    <Link href="/household" asChild>
      <Pressable accessibilityRole="button" testID="household-settings-link" style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.label}>Household</Text>
          <Text style={styles.help}>{subtitle}</Text>
        </View>
        <Text style={styles.label}>›</Text>
      </Pressable>
    </Link>
  );
}

export default function SettingsScreen() {
  const settings = useSettings();
  // Subscribe to gate changes; toggles for gated-off (e.g. future premium) features are not shown.
  useFeature('mealPlan');
  return (
    <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.form}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.section}>Optional features</Text>
        <Text style={styles.help}>Recipes always work on their own. Show only the extras you want.</Text>
        {FEATURES.filter((f) => featureGate.canUse(f.gate)).map((f) => (
          <View key={f.key} style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.label}>{f.label}</Text>
              <Text style={styles.help}>{f.help}</Text>
            </View>
            <Switch
              testID={`feature-toggle-${f.key}`}
              value={settings.features[f.key]}
              onValueChange={(v) => {
                void settingsStore.update({ features: { ...settings.features, [f.key]: v } });
              }}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        ))}
        <FeatureGate id="householdSync">
          <HouseholdSettingsLink />
        </FeatureGate>
      </ScrollView>
    </MaxWidthContainer>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  section: { color: colors.text, fontSize: 18, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  flex: { flex: 1 },
  label: { color: colors.text, fontSize: 16, fontWeight: '600' },
  help: { color: colors.muted },
});
