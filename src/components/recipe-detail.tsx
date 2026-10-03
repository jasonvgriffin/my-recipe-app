import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FeatureGate } from '@/components/feature-gate';
import { NutritionPanel } from '@/components/nutrition-panel';
import { ServingsUnits } from '@/components/servings-units';
import { cookSession } from '@/cooking';
import { useFeature, useFeatureVisible } from '@/hooks/use-feature';
import { useSettings } from '@/hooks/use-settings';
import { toIsoDate } from '@/lib/dates';
import { presentIngredient } from '@/lib/ingredients';
import { setCooked } from '@/lib/recipe-utils';
import { colors } from '@/lib/theme';
import { formatDuration } from '@/lib/timers';
import { effectiveUnitSystem } from '@/lib/units';
import { startBackgroundStepTimer } from '@/notifications/step-timers';
import { mealPlanStore } from '@/storage/meal-plan';
import { recipeStore } from '@/storage/recipes';
import { isLowCarb, netCarbs, type Recipe, type UnitSystem } from '@/types/recipe';

export interface RecipeDetailProps {
  id: string;
  /** Called after the recipe is deleted (route: go back; two-pane: clear selection). */
  onDeleted?: () => void;
  /** Called whenever the recipe loads or changes (route: set header title; two-pane: refresh list). */
  onChange?: (recipe: Recipe) => void;
}

/**
 * Recipe detail body, used by the /recipe/[id] route (compact) AND the Recipes tab's secondary pane
 * (medium/expanded, spec #23). Keep it free of navigation side effects — use the callbacks.
 */
export function RecipeDetail({ id, onDeleted, onChange }: RecipeDetailProps) {
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);
  // Optional cross-links (meal plan) only appear when that feature is enabled — recipes-first rule.
  // Gated entry points (src/entitlements) — recipe view/edit/delete itself is never gated.
  const showPlanToday = useFeatureVisible('mealPlan');
  const timers = useFeature('timers').available;
  const tags = useFeature('tags').available;
  const unitsEnabled = useFeature('unitConversion').available;
  const nutritionEnabled = useFeature('nutrition').available;
  const settings = useSettings();
  const [scaled, setScaled] = useState<{ id: string; value: number } | undefined>();
  const targetServings = scaled?.id === id ? scaled.value : undefined;

  // Parents should pass `key={id}` when switching recipes so state resets cleanly.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    let active = true;
    recipeStore.get(id).then((r) => {
      if (!active) return;
      setRecipe(r ?? null);
      if (r) onChangeRef.current?.(r);
    });
    return () => {
      active = false;
    };
  }, [id]);

  if (recipe === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (recipe === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.meta}>Recipe not found.</Text>
      </View>
    );
  }

  function confirmDelete(r: Recipe) {
    Alert.alert('Delete recipe?', `“${r.title}” will be removed from this device.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await recipeStore.remove(r.id);
          await mealPlanStore.removeEntriesForRecipe(r.id);
          onDeleted?.();
        },
      },
    ]);
  }

  const net = netCarbs(recipe.nutrition);

  async function toggleCooked(r: Recipe) {
    const next = setCooked(r, !r.cooked);
    await recipeStore.save(next);
    setRecipe(next);
    onChange?.(next);
  }

  async function planToday(r: Recipe) {
    await mealPlanStore.addEntry(toIsoDate(new Date()), r.id);
    Alert.alert('Added to meal plan', `“${r.title}” is planned for today.`);
  }

  // TODO(spec #22, #18): star rating (setRating), grocery-run for this recipe.
  // TODO(spec #2): Edit screen (all fields, substitute/add/delete ingredients).
  // TODO(spec #4): photo display; TODO(spec #14): Share button (text / photo / link, any combination).

  const current = recipe;
  const unitSystem = effectiveUnitSystem(current, settings);
  const scaledServings = targetServings ?? current.servings;
  const factor = current.servings > 0 ? scaledServings / current.servings : 1;

  async function openCook() {
    const state = await cookSession.getState();
    const action = state?.recipeId === current.id ? 'current' : current.id;
    router.push({ pathname: '/cook/[action]', params: { action, via: 'app' } });
  }

  async function setUnit(next: UnitSystem | 'original') {
    const saved = await recipeStore.save({ ...current, unitSystem: next });
    setRecipe(saved);
    onChange?.(saved);
  }

  function startTimer(stepIndex: number, durationSeconds: number | undefined) {
    void startBackgroundStepTimer(cookSession, {
      recipeId: current.id,
      recipeTitle: current.title,
      stepIndex,
      durationSeconds,
    }).then((outcome) => {
      if (!outcome.ok) {
        Alert.alert('Timer', outcome.result.ok ? 'Could not start that timer.' : outcome.result.message);
        return;
      }
      const label = durationSeconds ? formatDuration(durationSeconds) : 'Timer';
      if (outcome.permission === 'granted') {
        Alert.alert(
          'Timer started',
          `${label}. You’ll get a notification and a sound when it ends, even if you leave this screen.`,
        );
      } else {
        Alert.alert(
          'Timer running',
          'Notifications are off, so this countdown only updates while the app is open. Allow notifications to hear it in the background.',
        );
      }
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.container} testID="recipe-detail">
      <Text style={styles.title}>{recipe.title}</Text>
      {recipe.description ? <Text style={styles.description}>{recipe.description}</Text> : null}
      <View style={styles.stats}>
        <Stat label="Servings" value={String(recipe.servings)} />
        <Stat label="Net carbs / serving" value={net === undefined ? 'unknown' : `${net} g`} />
        <Stat
          label="Calories / serving"
          value={recipe.nutrition.calories === undefined ? '—' : String(recipe.nutrition.calories)}
        />
      </View>
      {isLowCarb(recipe) && <Text style={styles.badge}>Low-carb</Text>}
      {tags && recipe.tags.length > 0 && (
        <View style={styles.tagRow}>
          {recipe.tags.map((t) => (
            <Text key={t} style={styles.tag}>
              #{t}
            </Text>
          ))}
        </View>
      )}
      <View style={styles.actions}>
        <Pressable style={[styles.action, recipe.cooked && styles.actionOn]} onPress={() => toggleCooked(recipe)}>
          <Text style={[styles.actionText, recipe.cooked && styles.actionTextOn]}>
            {recipe.cooked ? '✓ Cooked' : 'Mark cooked'}
          </Text>
        </Pressable>
        <FeatureGate id="cookingMode">
          <Pressable style={styles.action} testID="cook-button" onPress={() => void openCook()}>
            <Text style={styles.actionText}>Cook</Text>
          </Pressable>
        </FeatureGate>
        {showPlanToday ? (
          <Pressable style={styles.action} onPress={() => planToday(recipe)} testID="plan-today-button">
            <Text style={styles.actionText}>Plan for today</Text>
          </Pressable>
        ) : null}
      </View>
      {recipe.lastCookedAt && (
        <Text style={styles.meta}>Last cooked {new Date(recipe.lastCookedAt).toLocaleDateString()}</Text>
      )}
      {recipe.sourceUrl && (
        <Text style={styles.link} onPress={() => Linking.openURL(recipe.sourceUrl!)}>
          Source: {recipe.sourceUrl}
        </Text>
      )}
      <Text style={styles.section}>Ingredients</Text>
      {unitsEnabled ? (
        <ServingsUnits
          baseServings={recipe.servings}
          targetServings={scaledServings}
          onAdjust={(delta) =>
            setScaled((prev) => {
              const base = prev?.id === id ? prev.value : current.servings;
              return { id, value: Math.max(1, base + delta) };
            })
          }
          unitSystem={unitSystem}
          onUnitSystem={(u) => void setUnit(u)}
        />
      ) : null}
      {recipe.ingredients.map((i, idx) => (
        <Text key={idx} style={styles.item}>
          •{' '}
          {presentIngredient(i, {
            unitSystem: unitsEnabled ? unitSystem : 'original',
            factor: unitsEnabled ? factor : 1,
          })}
        </Text>
      ))}
      <Text style={styles.section}>Steps</Text>
      {recipe.steps.map((st, idx) => (
        <View key={idx} style={styles.stepBlock}>
          <Text style={styles.item}>
            {idx + 1}. {st.text}
          </Text>
          {timers && st.durationSeconds ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Start ${formatDuration(st.durationSeconds)} timer for step ${idx + 1}`}
              testID={`step-timer-${idx}`}
              style={styles.timerBtn}
              onPress={() => startTimer(idx, st.durationSeconds)}>
              <Text style={styles.timer}>⏱ {formatDuration(st.durationSeconds)}</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      {nutritionEnabled ? (
        <NutritionPanel
          recipe={recipe}
          onChange={(next) => {
            setRecipe(next);
            onChange?.(next);
          }}
        />
      ) : null}
      {recipe.notes ? (
        <>
          <Text style={styles.section}>Notes</Text>
          <Text style={styles.item}>{recipe.notes}</Text>
        </>
      ) : null}
      <Pressable style={styles.delete} onPress={() => confirmDelete(recipe)}>
        <Text style={styles.deleteText}>Delete recipe</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  description: { marginTop: 6, color: colors.muted, fontSize: 15 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 12,
    backgroundColor: colors.primary,
    color: colors.primaryText,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
    fontWeight: '600',
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  tag: {
    backgroundColor: colors.tagBg,
    color: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  action: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.primary, alignItems: 'center' },
  actionOn: { backgroundColor: colors.primary },
  actionText: { color: colors.primary, fontWeight: '600' },
  actionTextOn: { color: colors.primaryText },
  stepBlock: { marginBottom: 8 },
  timerBtn: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  timer: { color: colors.primary, fontWeight: '700', fontSize: 16 },
  meta: { color: colors.muted, marginTop: 8 },
  link: { color: colors.primary, marginTop: 8, textDecorationLine: 'underline' },
  section: { fontSize: 18, fontWeight: '700', marginTop: 20, marginBottom: 8, color: colors.text },
  item: { fontSize: 16, lineHeight: 24, color: colors.text, marginBottom: 4 },
  delete: {
    marginTop: 28,
    padding: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteText: { color: colors.danger, fontWeight: '600' },
});
