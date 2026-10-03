import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/chip';
import { MaxWidthContainer, MAX_CONTENT_WIDTH } from '@/components/layout';
import { featureGate, type FeatureId } from '@/entitlements';
import { useFeature } from '@/hooks/use-feature';
import { useSettings } from '@/hooks/use-settings';
import { colors } from '@/lib/theme';
import { clampCookedRecentlyDays, settingsStore } from '@/storage/settings';
import type { OptionalFeatures } from '@/types/recipe';

const RECENT_PRESETS = [7, 14, 30, 90];

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
 * Settings. Recipe list preferences (cooked-recently window) plus optional-feature toggles.
 * Turning every optional feature off makes the app a pure recipe box.
 * TODO(spec #25): "Household sharing" section (opt-in sign-in). TODO(spec #16): units.
 */
export default function SettingsScreen() {
  const settings = useSettings();
  // Subscribe to gate changes; toggles for gated-off (e.g. future premium) features are not shown.
  useFeature('mealPlan');
  return (
    <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.form}>
      <ScrollView contentContainerStyle={styles.container} testID="settings-screen">
        <Text style={styles.section}>Recipes</Text>
        <Text style={styles.help}>
          “Cooked recently” means cooked within this many days. It applies to the filter on the Recipes tab.
        </Text>
        <View style={styles.presets}>
          {RECENT_PRESETS.map((days) => (
            <Chip
              key={days}
              label={`${days} days`}
              active={settings.cookedRecentlyDays === days}
              testID={`cooked-recently-${days}`}
              onPress={() => {
                void settingsStore.update({ cookedRecentlyDays: days });
              }}
            />
          ))}
        </View>
        <TextInput
          style={styles.input}
          value={String(settings.cookedRecentlyDays)}
          onChangeText={(text) => {
            if (!/^\d{1,3}$/.test(text)) return;
            void settingsStore.update({ cookedRecentlyDays: clampCookedRecentlyDays(Number(text)) });
          }}
          keyboardType="number-pad"
          accessibilityLabel="Cooked recently window in days"
          placeholderTextColor={colors.placeholder}
          testID="cooked-recently-input"
        />
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
                void settingsStore.update({ features: { [f.key]: v } });
              }}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        ))}
      </ScrollView>
    </MaxWidthContainer>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  section: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 8 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.input,
    color: colors.text,
    fontSize: 16,
  },
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
