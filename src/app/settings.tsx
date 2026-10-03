import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/chip';
import { MaxWidthContainer, MAX_CONTENT_WIDTH } from '@/components/layout';
import { featureGate, type FeatureId } from '@/entitlements';
import { useFeature } from '@/hooks/use-feature';
import { useSettings } from '@/hooks/use-settings';
import { colors } from '@/lib/theme';
import { clampCookedRecentlyDays, settingsStore } from '@/storage/settings';
import type { OptionalFeatures, UnitSystem } from '@/types/recipe';

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
 * Settings. Recipes are the core: everything here is optional. Recipe list preferences (cooked-recently
 * window), units, cooking mode, and optional-feature toggles. Turning every optional feature off makes the
 * app a pure recipe box. TODO(spec #25): "Household sharing" section (opt-in sign-in).
 */
const UNIT_CHOICES: { id: UnitSystem | 'original'; label: string }[] = [
  { id: 'original', label: 'As written' },
  { id: 'metric', label: 'Metric' },
  { id: 'imperial', label: 'Imperial' },
];

export default function SettingsScreen() {
  const settings = useSettings();
  // Subscribe to gate changes; toggles for gated-off (e.g. future premium) features are not shown.
  useFeature('mealPlan');
  const units = useFeature('unitConversion').available;
  const cooking = useFeature('cookingMode').available;
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
        <CookedRecentlyInput days={settings.cookedRecentlyDays} />
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
        {units ? (
          <>
            <Text style={styles.section}>Units</Text>
            <Text style={styles.help}>
              Default for recipes that don’t pick their own. Each recipe can override this.
            </Text>
            <View style={styles.units}>
              {UNIT_CHOICES.map((c) => {
                const selected = settings.unitSystem === c.id;
                return (
                  <Pressable
                    key={c.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    testID={`settings-unit-${c.id}`}
                    style={[styles.unit, selected && styles.unitOn]}
                    onPress={() => {
                      void settingsStore.update({ unitSystem: c.id });
                    }}>
                    <Text style={[styles.unitText, selected && styles.unitTextOn]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
        {cooking ? (
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.label}>Keep screen awake while cooking</Text>
              <Text style={styles.help}>Stops the phone from sleeping on the cooking screen.</Text>
            </View>
            <Switch
              testID="keep-awake-toggle"
              value={settings.cookingModeKeepAwake}
              onValueChange={(v) => {
                void settingsStore.update({ cookingModeKeepAwake: v });
              }}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
        ) : null}
      </ScrollView>
    </MaxWidthContainer>
  );
}

/**
 * Free-form "cooked recently" days (1–365). Keeps a local draft so the field can be cleared while typing;
 * valid values save immediately, and leaving the field restores the saved value if the draft is invalid.
 */
function CookedRecentlyInput({ days }: { days: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <TextInput
      style={styles.input}
      value={draft ?? String(days)}
      onChangeText={(text) => {
        if (!/^\d{0,3}$/.test(text)) return;
        setDraft(text);
        const n = Number(text);
        if (text && n >= 1) void settingsStore.update({ cookedRecentlyDays: clampCookedRecentlyDays(n) });
      }}
      onBlur={() => setDraft(null)}
      keyboardType="number-pad"
      accessibilityLabel="Cooked recently window in days"
      placeholder="14"
      placeholderTextColor={colors.placeholder}
      testID="cooked-recently-input"
    />
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
  units: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unit: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  unitText: { color: colors.text, fontWeight: '600' },
  unitTextOn: { color: colors.primaryText },
});
