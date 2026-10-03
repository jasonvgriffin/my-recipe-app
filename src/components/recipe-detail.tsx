import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { useBottomInset } from '@/components/layout';
import { CategoryChips } from '@/components/category-chips';
import { FeatureGate } from '@/components/feature-gate';
import { ServingsUnits } from '@/components/servings-units';
import { SharedBy } from '@/components/shared-by';
import { ShareRecipePanel } from '@/components/share-recipe-panel';
import { StarRating } from '@/components/star-rating';
import { TagEditor } from '@/components/tag-editor';
import { cookSession } from '@/cooking';
import { useFeature, useFeatureVisible } from '@/hooks/use-feature';
import { useOnDataChange } from '@/hooks/use-on-data-change';
import { usePdfExport } from '@/hooks/use-pdf-export';
import { useSettings } from '@/hooks/use-settings';
import { formatCookedOn, toIsoDate } from '@/lib/dates';
import { presentIngredient } from '@/lib/ingredients';
import { addRecipeTags, removeRecipeTag, setCooked, setRating, toggleRecipeCategory } from '@/lib/recipe-utils';
import { makeStyles, useColors } from '@/hooks/use-theme';
import { formatDuration } from '@/lib/timers';
import { effectiveUnitSystem } from '@/lib/units';
import { startBackgroundStepTimer } from '@/notifications/step-timers';
import { mealPlanStore } from '@/storage/meal-plan';
import { recipeStore } from '@/storage/recipes';
import type { Category, Recipe, UnitSystem } from '@/types/recipe';

export interface RecipeDetailProps {
  id: string;
  /** Called after the recipe is deleted (route: go back; two-pane: clear selection). */
  onDeleted?: () => void;
  /** Called whenever the recipe loads or changes (route: set header title; two-pane: refresh list). */
  onChange?: (recipe: Recipe) => void;
  /**
   * Categories to assign (spec #3). Pass them from a focused screen so the list refreshes on return.
   * When omitted, the detail loads them once.
   */
  categories?: Category[];
}

/**
 * Recipe detail body, used by the /recipe/[id] route (compact) AND the Recipes tab's secondary pane
 * (medium/expanded, spec #23). Keep it free of navigation side effects — use the callbacks.
 */
export function RecipeDetail({ id, onDeleted, onChange, categories: categoriesProp }: RecipeDetailProps) {
  const bottomInset = useBottomInset();
  const styles = useStyles();
  const colors = useColors();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);
  // Optional cross-links (meal plan) only appear when that feature is enabled — recipes-first rule.
  // Gated entry points (src/entitlements) — recipe view/edit/delete itself is never gated.
  const showPlanToday = useFeatureVisible('mealPlan');
  const showGroceryRun = useFeatureVisible('groceryRun');
  const timers = useFeature('timers').available;
  const tagsOn = useFeature('tags').available;
  const categoriesOn = useFeature('categories').available;
  const ratingsOn = useFeature('ratings').available;
  const photos = useFeature('photos').available;
  const share = useFeature('share').available;
  const pdf = usePdfExport();
  const unitsEnabled = useFeature('unitConversion').available;
  const settings = useSettings();
  const [scaled, setScaled] = useState<{ id: string; value: number } | undefined>();
  const targetServings = scaled?.id === id ? scaled.value : undefined;
  const [shareOpen, setShareOpen] = useState(false);
  const [loadedCategories, setLoadedCategories] = useState<Category[]>([]);
  const categories = categoriesProp ?? loadedCategories;

  // Parents should pass `key={id}` when switching recipes so state resets cleanly.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  // Reload when the screen is focused again (after Edit) and on first show. Adapts live; state stays here.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      recipeStore.get(id).then((r) => {
        if (!active) return;
        setRecipe(r ?? null);
        if (r) onChangeRef.current?.(r);
      });
      return () => {
        active = false;
      };
    }, [id]),
  );

  useEffect(() => {
    if (categoriesProp || !categoriesOn) return;
    let active = true;
    recipeStore.listCategories().then((c) => {
      if (active) setLoadedCategories(c);
    });
    return () => {
      active = false;
    };
  }, [categoriesOn, categoriesProp, id]);
  // Household sync (spec #25): reload when this recipe changes on another device.
  useOnDataChange(() => {
    void recipeStore.get(id).then((r) => {
      setRecipe(r ?? null);
      if (r) onChangeRef.current?.(r);
    });
  });

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

  async function persist(next: Recipe) {
    await recipeStore.save(next);
    setRecipe(next);
    onChange?.(next);
  }

  async function toggleCooked(r: Recipe) {
    await persist(setCooked(r, !r.cooked));
  }

  async function logCook(r: Recipe) {
    await persist(setCooked(r, true));
  }

  async function planToday(r: Recipe) {
    await mealPlanStore.addEntry(toIsoDate(new Date()), r.id);
    Alert.alert('Added to meal plan', `“${r.title}” is planned for today.`);
  }

  const history = [...(recipe.cookHistory ?? [])].reverse();
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
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: 48 + bottomInset }]} testID="recipe-detail">
      {photos && recipe.photoUri ? (
        <Image
          source={{ uri: recipe.photoUri }}
          style={styles.photo}
          accessibilityLabel={`Photo of ${recipe.title}`}
          testID="recipe-photo"
        />
      ) : null}
      <Text style={styles.title}>{recipe.title}</Text>
      <SharedBy createdBy={recipe.createdBy} />
      {recipe.description ? <Text style={styles.description}>{recipe.description}</Text> : null}
      <View style={styles.stats}>
        <Stat label="Servings" value={String(recipe.servings)} />
        <Stat label="Times cooked" value={String(recipe.cookHistory?.length ?? 0)} />
      </View>
      {ratingsOn ? (
        <View style={styles.block}>
          <Text style={styles.section}>Rating</Text>
          <StarRating
            value={recipe.rating}
            testID="detail-rating"
            onChange={(rating) => {
              void persist(setRating(recipe, rating));
            }}
          />
          {recipe.rating ? null : <Text style={styles.meta}>Not rated</Text>}
        </View>
      ) : null}
      {categoriesOn && categories.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.section}>Categories</Text>
          <CategoryChips
            categories={categories}
            selectedIds={recipe.categoryIds}
            onToggle={(categoryId) => {
              void persist(toggleRecipeCategory(recipe, categoryId));
            }}
            testIDPrefix="assign-category"
          />
        </View>
      ) : null}
      {tagsOn ? (
        <View style={styles.block}>
          <Text style={styles.section}>Tags</Text>
          <TagEditor
            tags={recipe.tags}
            onAdd={(text) => {
              const next = addRecipeTags(recipe, text);
              if (next !== recipe) void persist(next);
            }}
            onRemove={(tag) => {
              const next = removeRecipeTag(recipe, tag);
              if (next !== recipe) void persist(next);
            }}
          />
        </View>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          style={[styles.action, recipe.cooked && styles.actionOn]}
          onPress={() => toggleCooked(recipe)}
          testID="cooked-toggle"
          accessibilityRole="button">
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
        {showGroceryRun ? (
          <Link href={{ pathname: '/grocery-run', params: { recipeId: recipe.id } }} asChild>
            <Pressable style={styles.action} accessibilityRole="button" testID="grocery-run-button">
              <Text style={styles.actionText}>Grocery run</Text>
            </Pressable>
          </Link>
        ) : null}
        <Link href={{ pathname: '/recipe/[id]/edit', params: { id: recipe.id } }} asChild>
          <Pressable style={styles.action} accessibilityRole="button" testID="edit-recipe-button">
            <Text style={styles.actionText}>Edit</Text>
          </Pressable>
        </Link>
        {share ? (
          <Pressable
            style={styles.action}
            accessibilityRole="button"
            testID="share-recipe-button"
            onPress={() => setShareOpen((open) => !open)}>
            <Text style={styles.actionText}>Share</Text>
          </Pressable>
        ) : null}
        {pdf.available ? (
          <Pressable
            style={[styles.action, pdf.busy && styles.actionBusy]}
            accessibilityRole="button"
            accessibilityHint="Creates a printable PDF of this recipe and opens the share sheet"
            disabled={pdf.busy}
            testID="export-pdf-button"
            onPress={() => void pdf.exportPdf([recipe])}>
            {pdf.busy ? (
              <ActivityIndicator color={colors.primary} testID="export-pdf-busy" />
            ) : (
              <Text style={styles.actionText}>Export PDF</Text>
            )}
          </Pressable>
        ) : null}
      </View>
      {pdf.error ? (
        <Text style={styles.pdfError} testID="export-pdf-error">
          {pdf.error}
        </Text>
      ) : null}
      {shareOpen && share ? <ShareRecipePanel recipe={recipe} onClose={() => setShareOpen(false)} /> : null}
      {recipe.lastCookedAt ? (
        <Text style={styles.meta} testID="last-cooked">
          Last cooked {formatCookedOn(recipe.lastCookedAt)}
        </Text>
      ) : null}
      {recipe.cooked ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => logCook(recipe)}
          style={styles.logCook}
          testID="log-cook-button">
          <Text style={styles.actionText}>Cooked again</Text>
        </Pressable>
      ) : null}
      {history.length > 0 ? (
        <View testID="cook-history" style={styles.block}>
          <Text style={styles.meta}>
            Cooked {history.length} {history.length === 1 ? 'time' : 'times'}
          </Text>
          {history.map((ts, i) => (
            <Text key={`${ts}-${i}`} style={styles.historyItem}>
              {formatCookedOn(ts)}
            </Text>
          ))}
        </View>
      ) : null}
      {recipe.sourceUrl ? (
        <Pressable
          accessibilityRole="link"
          testID="source-link"
          style={styles.linkHit}
          onPress={() => Linking.openURL(recipe.sourceUrl!)}>
          <Text style={styles.link}>Source: {recipe.sourceUrl}</Text>
        </Pressable>
      ) : null}
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
        <View key={idx}>
          <Text style={styles.item}>
            •{' '}
            {presentIngredient(i, {
              unitSystem: unitsEnabled ? unitSystem : 'original',
              factor: unitsEnabled ? factor : 1,
            })}
          </Text>
          {i.substitutionNote ? (
            <Text style={styles.substitution} testID={`substitution-${idx}`}>
              Substitution: {i.substitutionNote}
            </Text>
          ) : null}
        </View>
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
      {recipe.notes ? (
        <>
          <Text style={styles.section}>Notes</Text>
          <Text style={styles.item} testID="recipe-notes">
            {recipe.notes}
          </Text>
        </>
      ) : null}
      <Pressable style={styles.delete} onPress={() => confirmDelete(recipe)}>
        <Text style={styles.deleteText}>Delete recipe</Text>
      </Pressable>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  photo: { width: '100%', height: 200, borderRadius: 10, marginBottom: 12, backgroundColor: colors.card },
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
  block: { marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  action: {
    minWidth: 108,
    flexGrow: 1,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logCook: {
    alignSelf: 'flex-start',
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyItem: { color: colors.text, fontSize: 15, marginTop: 2 },
  actionOn: { backgroundColor: colors.primary },
  actionText: { color: colors.primary, fontWeight: '600' },
  actionTextOn: { color: colors.primaryText },
  actionBusy: { opacity: 0.6 },
  pdfError: { color: colors.danger, marginTop: 8 },
  stepBlock: { marginBottom: 8 },
  timerBtn: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  timer: { color: colors.primary, fontWeight: '700', fontSize: 16 },
  meta: { color: colors.muted, marginTop: 8 },
  linkHit: { minHeight: 44, justifyContent: 'center', marginTop: 8 },
  link: { color: colors.primary, textDecorationLine: 'underline' },
  substitution: { color: colors.muted, marginLeft: 16, marginBottom: 4 },
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
}));
