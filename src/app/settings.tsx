import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Switch, Text, View } from 'react-native';

import { MaxWidthContainer, MAX_CONTENT_WIDTH, useBottomInset } from '@/components/layout';
import { appVersion } from '@/config';
import { featureGate, type FeatureId } from '@/entitlements';
import { useFeature } from '@/hooks/use-feature';
import { useSettings } from '@/hooks/use-settings';
import { makeStyles, useColorSchemeResolved, useColors } from '@/hooks/use-theme';
import {
  APP_ICONS,
  canChangeAppIcon,
  changeAppIcon,
  currentAppIcon,
  DEFAULT_APP_ICON,
  isAppIconId,
  type AppIconId,
} from '@/lib/app-icons';
import { ACCENTS, THEME_MODES } from '@/lib/theme';
import { settingsStore } from '@/storage/settings';
import type { OptionalFeatures, UnitSystem } from '@/types/recipe';

const FEATURES: { key: keyof OptionalFeatures; gate: FeatureId; label: string; help: string }[] = [
  { key: 'mealPlan', gate: 'mealPlan', label: 'Meal plan', help: 'Plan recipes on a calendar.' },
  {
    key: 'shopping',
    gate: 'shoppingList',
    label: 'Shopping list',
    help: 'Lists built from your meal plan, Shopping List mode.',
  },
  { key: 'pantry', gate: 'pantry', label: 'Pantry', help: 'Track what you have, with barcode scanning.' },
];

/**
 * Settings. Recipes are the core: everything here is optional. Appearance
 * (theme mode + accent color, v1.0.3; free, not gated), units,
 * cooking mode, and optional-feature toggles; the app version at the bottom. (The "cooked recently" window is
 * fixed at 14 days since v1.0.2 — `COOKED_RECENTLY_DAYS`.) Turning every optional feature off makes the
 * app a pure recipe box.
 */
const UNIT_CHOICES: { id: UnitSystem | 'original'; label: string }[] = [
  { id: 'original', label: 'As written' },
  { id: 'metric', label: 'Metric' },
  { id: 'imperial', label: 'Imperial' },
];

export default function SettingsScreen() {
  const bottomInset = useBottomInset();
  const styles = useStyles();
  const colors = useColors();
  const settings = useSettings();
  // Subscribe to gate changes; toggles for gated-off (e.g. future premium) features are not shown.
  useFeature('mealPlan');
  const units = useFeature('unitConversion').available;
  const cooking = useFeature('cookingMode').available;
  const version = appVersion();
  return (
    <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.form}>
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: 16 + bottomInset }]} testID="settings-screen">
        <AppearanceSection />
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
              trackColor={{ true: colors.switchTrack, false: colors.border }}
              thumbColor={settings.features[f.key] ? colors.switchThumb : colors.card}
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
              trackColor={{ true: colors.switchTrack, false: colors.border }}
              thumbColor={settings.cookingModeKeepAwake ? colors.switchThumb : colors.card}
            />
          </View>
        ) : null}
        <Text style={styles.section}>Backup & restore</Text>
        <Link href="/backup" asChild>
          <Pressable accessibilityRole="button" testID="backup-settings-link" style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.label}>Backup & restore</Text>
              <Text style={styles.help}>Save all your recipes, photos, plans and settings to a file, or restore one.</Text>
            </View>
            <Text style={styles.label}>›</Text>
          </Pressable>
        </Link>
        {version ? (
          <Text style={styles.version} testID="app-version">
            Version {version}
          </Text>
        ) : null}
      </ScrollView>
    </MaxWidthContainer>
  );
}

/**
 * Appearance (v1.0.3): theme mode System / Light / Dark (default System) and an accent color applied app-wide
 * (tab highlight, links and buttons, the + button and + menu icons). Saved locally in settings; not gated.
 */
function AppearanceSection() {
  const styles = useStyles();
  const colors = useColors();
  const scheme = useColorSchemeResolved();
  const { appearance } = useSettings();
  return (
    <>
      <Text style={styles.section}>Appearance</Text>
      <Text style={styles.help}>Theme</Text>
      <View style={styles.units} accessibilityRole="radiogroup" accessibilityLabel="Theme">
        {THEME_MODES.map((m) => {
          const selected = appearance.themeMode === m.id;
          return (
            <Pressable
              key={m.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              testID={`settings-theme-${m.id}`}
              style={[styles.unit, selected && styles.unitOn]}
              onPress={() => {
                void settingsStore.update({ appearance: { themeMode: m.id } });
              }}>
              <Text style={[styles.unitText, selected && styles.unitTextOn]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.help}>Accent color</Text>
      <View style={styles.accents} accessibilityRole="radiogroup" accessibilityLabel="Accent color">
        {ACCENTS.map((a) => {
          const selected = appearance.accent === a.id;
          const swatch = a[scheme].primary;
          return (
            <Pressable
              key={a.id}
              accessibilityRole="radio"
              accessibilityLabel={`${a.label} accent`}
              accessibilityState={{ selected }}
              testID={`settings-accent-${a.id}`}
              style={[styles.accent, selected && { borderColor: colors.primary }]}
              onPress={() => {
                void settingsStore.update({ appearance: { accent: a.id } });
              }}>
              <View style={[styles.swatch, { backgroundColor: swatch }]}>
                {selected ? <Ionicons name="checkmark" size={20} color={a[scheme].primaryText} /> : null}
              </View>
              <Text style={styles.accentLabel}>{a.label}</Text>
              {a.id === 'green' ? <Text style={styles.accentHint}>Default</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <AppIconPicker />
    </>
  );
}

/**
 * App icon (v1.0.6, Android): previews of every launcher icon; tapping one warns that launchers may take a moment
 * or move the shortcut, then switches the activity-alias and saves the choice. Hidden where it can't work (iOS).
 */
function AppIconPicker() {
  const styles = useStyles();
  const colors = useColors();
  const { appearance } = useSettings();
  const [current, setCurrent] = useState<AppIconId>(() => currentAppIcon() ?? (isAppIconId(appearance.appIcon) ? appearance.appIcon : DEFAULT_APP_ICON));
  const [error, setError] = useState<string | undefined>();
  if (!canChangeAppIcon()) return null;

  function pick(id: AppIconId) {
    if (id === current) return;
    const label = APP_ICONS.find((i) => i.id === id)?.label ?? id;
    Alert.alert(
      `Use the ${label} icon?`,
      'Your home screen updates in a moment. Some launchers take a little while, or move the shortcut to the app drawer — add it back if it disappears.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change icon',
          onPress: () => {
            setError(undefined);
            changeAppIcon(id)
              .then(() => {
                setCurrent(id);
                return settingsStore.update({ appearance: { appIcon: id } });
              })
              .catch(() => setError('Could not change the icon on this phone.'));
          },
        },
      ],
    );
  }

  return (
    <>
      <Text style={styles.help}>App icon</Text>
      <View style={styles.accents} accessibilityRole="radiogroup" accessibilityLabel="App icon" testID="app-icon-picker">
        {APP_ICONS.map((icon) => {
          const selected = icon.id === current;
          return (
            <Pressable
              key={icon.id}
              accessibilityRole="radio"
              accessibilityLabel={`${icon.label} app icon`}
              accessibilityState={{ selected }}
              testID={`settings-app-icon-${icon.id}`}
              style={[styles.accent, styles.iconTile, selected && { borderColor: colors.primary }]}
              onPress={() => pick(icon.id)}>
              <Image source={icon.preview} style={styles.iconPreview} accessibilityIgnoresInvertColors />
              {/* v1.0.7: one line, shrinks to fit — never breaks mid-word ("Midnigh/t"). */}
              <Text style={styles.accentLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                {icon.label}
              </Text>
              {icon.id === 'default' ? <Text style={styles.accentHint}>Default</Text> : null}
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text style={styles.help} testID="app-icon-error">
          {error}
        </Text>
      ) : null}
    </>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { padding: 16, gap: 12 },
  section: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 8 },
  version: { color: colors.muted, textAlign: 'center', marginTop: 16 },
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
  accents: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // v1.0.5: 12 accents; equal-width tiles wrap into tidy rows.
  accent: {
    width: 76,
    minHeight: 44,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  swatch: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  iconTile: { width: 100 },
  iconPreview: { width: 48, height: 48, borderRadius: 24 },
  accentLabel: { color: colors.text, fontSize: 13, fontWeight: '600' },
  accentHint: { color: colors.muted, fontSize: 11, marginTop: -2 },
}));
