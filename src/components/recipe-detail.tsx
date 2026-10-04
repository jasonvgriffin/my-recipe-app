import { Link, router, useFocusEffect, useNavigation } from 'expo-router';
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
import { addRecipeTags, removeRecipeTag, setCooked, setRating, setRecipeCategory } from '@/lib/recipe-utils';
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
  const [recipe, setRecipeState] = useState<Recipe | null | undefined>(undefined);
  // Latest recipe for queued saves, so quick taps never build on a stale copy and overwrite each other.
  const latest = useRef<Recipe | null | undefined>(undefined);
  const setRecipe = useCallback((r: Recipe | null) => {
    latest.current = r;
    setRecipeState(r);
  }, []);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const [pendingSaves, setPendingSaves] = useState(0);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Tag typed but not yet added — the one edit on this screen that isn't saved until you act.
  const [tagDraft, setTagDraft] = useState('');
  const dirty = tagDraft.trim().length > 0 || saveError;
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  const navigation = useNavigation();
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
    }, [id, setRecipe]),
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

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  /**
   * Save an edit. Edits run one after another against the latest saved recipe, and the stamped record
   * from storage is what we show, so rapid taps (rating, then category, then a tag) all stick.
   */
  const persist = useCallback(
    (update: (r: Recipe) => Recipe): Promise<void> => {
      setPendingSaves((n) => n + 1);
      const run = saveQueue.current.then(async () => {
        const base = latest.current;
        if (!base) return;
        const next = update(base);
        if (next === base) return;
        const saved = await recipeStore.save(next);
        setRecipe(saved);
        onChangeRef.current?.(saved);
        setSaveError(false);
        setSavedFlash(true);
        clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setSavedFlash(false), 2000);
      });
      saveQueue.current = run
        .catch(() => {
          setSaveError(true);
        })
        .finally(() => setPendingSaves((n) => n - 1));
      return saveQueue.current;
    },
    [setRecipe],
  );

  /** The Save button: add any typed tag, then wait for every queued edit to land. */
  const saveAll = useCallback(async () => {
    const text = tagDraft.trim();
    setTagDraft('');
    if (text) await persist((r) => addRecipeTags(r, text));
    else if (saveError && latest.current) {
      const current = latest.current;
      await persist(() => ({ ...current }));
    } else await saveQueue.current;
  }, [persist, saveError, tagDraft]);
  const saveAllRef = useRef(saveAll);
  useEffect(() => {
    saveAllRef.current = saveAll;
  }, [saveAll]);

  // Ask before leaving with unsaved changes (back button, header back, swipe).
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      Alert.alert('Save changes?', 'You have changes on this recipe that haven’t been saved.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            dirtyRef.current = false;
            navigation.dispatch(e.data.action);
          },
        },
        {
          text: 'Save',
          onPress: () => {
            void saveAllRef.current().then(() => {
              dirtyRef.current = false;
              navigation.dispatch(e.data.action);
            });
          },
        },
      ]);
    });
  }, [navigation]);

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

  async function toggleCooked() {
    await persist((r) => setCooked(r, !r.cooked));
  }

  async function logCook() {
    await persist((r) => setCooked(r, true));
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
    await persist((r) => ({ ...r, unitSystem: next }));
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
    // The bottom inset pads the whole screen (not just the scroll content) so nothing — the action
    // buttons or the save bar — ever sits under the Android navigation bar.
    <View style={[styles.screen, { paddingBottom: bottomInset }]} testID="recipe-detail-screen">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        testID="recipe-detail">
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
                void persist((r) => setRating(r, rating));
              }}
            />
            {recipe.rating ? null : <Text style={styles.meta}>Not rated</Text>}
          </View>
        ) : null}
        {categoriesOn && categories.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.section}>Category</Text>
            <CategoryChips
              single
              categories={categories}
              selectedIds={recipe.categoryIds}
              onToggle={(categoryId) => {
                void persist((r) => setRecipeCategory(r, categoryId));
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
              draft={tagDraft}
              onDraftChange={setTagDraft}
              onAdd={(text) => {
                void persist((r) => addRecipeTags(r, text));
              }}
              onRemove={(tag) => {
                void persist((r) => removeRecipeTag(r, tag));
              }}
            />
          </View>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            style={[styles.action, recipe.cooked && styles.actionOn]}
            onPress={() => void toggleCooked()}
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
                <Text style={styles.actionText}>View Shopping List</Text>
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
            onPress={() => void logCook()}
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
      {ratingsOn || categoriesOn || tagsOn ? (
        <View style={styles.saveBar} testID="recipe-save-bar">
          <Text
            style={[styles.saveStatus, saveError && styles.saveStatusError]}
            accessibilityLiveRegion="polite"
            testID="recipe-save-status">
            {saveError
              ? 'Couldn’t save — tap Save to try again'
              : pendingSaves > 0
                ? 'Saving…'
                : tagDraft.trim()
                  ? `Unsaved tag “${tagDraft.trim()}”`
                  : savedFlash
                    ? '✓ Saved'
                    : 'All changes saved'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save changes"
            accessibilityState={{ disabled: !dirty }}
            disabled={!dirty}
            onPress={() => void saveAll()}
            style={[styles.saveButton, !dirty && styles.saveButtonIdle]}
            testID="recipe-save-button">
            <Text style={[styles.saveButtonText, !dirty && styles.saveButtonTextIdle]}>{dirty ? 'Save' : 'Saved'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
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
  screen: { flex: 1 },
  scroll: { flex: 1 },
  container: { padding: 16, paddingBottom: 32 },
  saveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  saveStatus: { flex: 1, color: colors.muted, fontSize: 14 },
  saveStatusError: { color: colors.danger },
  saveButton: {
    minHeight: 44,
    minWidth: 96,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonIdle: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  saveButtonText: { color: colors.primaryText, fontWeight: '700' },
  saveButtonTextIdle: { color: colors.muted },
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
