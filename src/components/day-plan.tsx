import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useSyncExternalStore, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { KeyboardAwareScrollView, useBottomInset } from '@/components/layout';
import { useOnDataChange } from '@/hooks/use-on-data-change';
import { addDays, formatLongDate } from '@/lib/dates';
import {
  ANY_TIME_LABEL,
  defaultMealCategoryId,
  getPendingMeal,
  groupMealPlanEntries,
  resolveMealSlot,
  setPendingMeal,
  subscribePendingMeal,
  type PendingMeal,
} from '@/lib/meal-plan';
import { searchRecipes } from '@/lib/recipe-utils';
import { makeStyles, useColors } from '@/hooks/use-theme';
import { mealPlanStore } from '@/storage/meal-plan';
import { recipeStore } from '@/storage/recipes';
import type { IsoDate, MealPlanEntry } from '@/types/meal-plan';
import type { Category, Recipe } from '@/types/recipe';

/**
 * One day's plan: assign a recipe to a meal, move it, or remove it (spec #11).
 * Used in the expanded secondary pane and on the compact day route. Writes go through the meal-plan store.
 */
export function DayPlan({ date, onChanged }: { date: IsoDate; onChanged?: () => void }) {
  const bottomInset = useBottomInset();
  const styles = useStyles();
  const colors = useColors();
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [slot, setSlot] = useState<string | undefined>(undefined);
  const [query, setQuery] = useState('');
  const [servingsText, setServingsText] = useState('');
  const storedPending = useSyncExternalStore(subscribePendingMeal, getPendingMeal, getPendingMeal);
  const pending = storedPending?.date === date ? storedPending : null;

  useEffect(() => {
    const current = getPendingMeal();
    if (current && current.date !== date) setPendingMeal(null);
  }, [date]);

  const load = useCallback(async () => {
    await recipeStore.prepareCategories();
    const [dayEntries, all, cats] = await Promise.all([
      mealPlanStore.entriesForDates([date]),
      recipeStore.list(),
      recipeStore.listCategories(),
    ]);
    setEntries(dayEntries);
    setRecipes(all);
    setCategories(cats);
    setSlot((current) => (current && cats.some((c) => c.id === current) ? current : defaultMealCategoryId(cats)));
  }, [date]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load().catch(() => {
        if (active) {
          setRecipes([]);
          setCategories([]);
        }
      });
      return () => {
        active = false;
      };
    }, [load]),
  );
  // Reload when data changes elsewhere (e.g. a Backup & restore).
  useOnDataChange(() => {
    void load().catch(() => undefined);
  });

  async function changed() {
    await load();
    onChanged?.();
  }

  const byId = new Map(recipes.map((r) => [r.id, r]));
  const matches = searchRecipes(recipes, query).slice(0, 30);

  function sameCategory(entrySlot: string | undefined, categoryId: string | undefined): boolean {
    const resolved = resolveMealSlot(entrySlot, categories);
    if (!categoryId) return resolved.key === 'any';
    return resolved.categoryId === categoryId;
  }

  function addRecipe(recipe: Recipe) {
    const already = entries.some((e) => e.recipeId === recipe.id && sameCategory(e.slot, slot));
    if (already || pending) return;
    const servings = Number(servingsText);
    setPendingMeal({
      date,
      recipeId: recipe.id,
      slot,
      servings: servingsText.trim() && Number.isFinite(servings) && servings > 0 ? servings : undefined,
    });
  }

  function patchPending(patch: Partial<Pick<PendingMeal, 'slot' | 'servings'>>) {
    const current = getPendingMeal();
    if (!current || current.date !== date) return;
    setPendingMeal({ ...current, ...patch });
  }

  async function savePending() {
    const current = getPendingMeal();
    if (!current || current.date !== date) return;
    const duplicate = entries.some((e) => e.recipeId === current.recipeId && sameCategory(e.slot, current.slot));
    if (!duplicate) {
      await mealPlanStore.placeEntry({
        date: current.date,
        recipeId: current.recipeId,
        slot: current.slot,
        servings: current.servings,
      });
    }
    setPendingMeal(null);
    setServingsText('');
    await changed();
  }

  async function setSlotFor(entry: MealPlanEntry, categoryId: string) {
    if (resolveMealSlot(entry.slot, categories).categoryId === categoryId) return;
    await mealPlanStore.updateEntry(entry.id, { slot: categoryId });
    await changed();
  }

  async function shiftDay(entry: MealPlanEntry, delta: number) {
    await mealPlanStore.updateEntry(entry.id, { date: addDays(entry.date, delta) });
    await changed();
  }

  async function shiftServings(entry: MealPlanEntry, recipe: Recipe | undefined, delta: number) {
    const current = entry.servings ?? recipe?.servings ?? 1;
    await mealPlanStore.updateEntry(entry.id, { servings: Math.max(1, current + delta) });
    await changed();
  }

  async function remove(entry: MealPlanEntry) {
    await mealPlanStore.removeEntry(entry.id);
    await changed();
  }

  const visibleEntries: MealPlanEntry[] = pending
    ? [
        ...entries,
        {
          id: PENDING_ENTRY_ID,
          date,
          recipeId: pending.recipeId,
          slot: pending.slot,
          servings: pending.servings,
          createdAt: '',
          updatedAt: '',
        },
      ]
    : entries;
  const groups = groupMealPlanEntries(visibleEntries, categories);
  const selectedCategory = categories.find((c) => c.id === slot);

  return (
    <View style={styles.screen}>
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.container, { paddingBottom: 48 + bottomInset }]}
        testID="day-plan">
        <Text style={styles.heading}>{formatLongDate(date)}</Text>
        {visibleEntries.length === 0 ? <Text style={styles.empty}>Nothing planned</Text> : null}
        {groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <Text style={styles.groupLabel}>{group.label}</Text>
            {group.items.map((entry) => {
              const isPending = entry.id === PENDING_ENTRY_ID;
              const recipe = byId.get(entry.recipeId);
              const title = recipe?.title ?? 'Recipe unavailable';
              const servings = entry.servings ?? recipe?.servings;
              return (
                <View key={entry.id} style={styles.entry} testID={isPending ? 'pending-meal' : `entry-${entry.id}`}>
                  <Text style={styles.title}>{title}</Text>
                  <View style={styles.row}>
                    {categories.map((c) => (
                      <SlotChip
                        key={c.id}
                        label={c.name}
                        accessibilityLabel={`Set ${title} to ${c.name}`}
                        active={resolveMealSlot(entry.slot, categories).categoryId === c.id}
                        onPress={() => (isPending ? patchPending({ slot: c.id }) : setSlotFor(entry, c.id))}
                        testID={isPending ? `pending-slot-${c.id}` : `entry-slot-${entry.id}-${c.id}`}
                      />
                    ))}
                  </View>
                  <View style={styles.row}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Decrease servings for ${title}`}
                      onPress={() =>
                        isPending
                          ? patchPending({ servings: Math.max(1, (entry.servings ?? recipe?.servings ?? 1) - 1) })
                          : shiftServings(entry, recipe, -1)
                      }
                      style={styles.iconBtn}>
                      <Text style={styles.iconBtnText}>−</Text>
                    </Pressable>
                    <Text style={styles.servings}>{servings ?? '—'} servings</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Increase servings for ${title}`}
                      onPress={() =>
                        isPending
                          ? patchPending({ servings: (entry.servings ?? recipe?.servings ?? 1) + 1 })
                          : shiftServings(entry, recipe, 1)
                      }
                      style={styles.iconBtn}>
                      <Text style={styles.iconBtnText}>+</Text>
                    </Pressable>
                  </View>
                  <View style={styles.row}>
                    {isPending ? null : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Move ${title} to the previous day`}
                        onPress={() => shiftDay(entry, -1)}
                        style={styles.textBtn}
                        testID={`move-earlier-${entry.id}`}>
                        <Text style={styles.textBtnLabel}>‹ Day</Text>
                      </Pressable>
                    )}
                    {isPending ? null : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Move ${title} to the next day`}
                        onPress={() => shiftDay(entry, 1)}
                        style={styles.textBtn}
                        testID={`move-later-${entry.id}`}>
                        <Text style={styles.textBtnLabel}>Day ›</Text>
                      </Pressable>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${title}`}
                      onPress={() => (isPending ? setPendingMeal(null) : remove(entry))}
                      style={styles.remove}
                      testID={isPending ? 'remove-pending' : `remove-${entry.id}`}>
                      <Text style={styles.removeText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        {pending ? null : (
          <>
            <Text style={styles.section}>Add a recipe</Text>
            <View style={styles.row}>
              {categories.map((c) => (
                <SlotChip
                  key={c.id}
                  label={c.name}
                  active={slot === c.id}
                  onPress={() => setSlot(c.id)}
                  testID={`new-slot-${c.id}`}
                />
              ))}
            </View>
            <TextInput
              value={servingsText}
              onChangeText={setServingsText}
              placeholder="Servings (optional)"
              placeholderTextColor={colors.placeholder}
              keyboardType="number-pad"
              style={styles.input}
              testID="new-servings"
            />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search recipes"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              style={styles.input}
              testID="recipe-search"
            />
            {matches.length === 0 ? <Text style={styles.empty}>No recipes to add.</Text> : null}
            {matches.map((recipe) => (
              <Pressable
                key={recipe.id}
                accessibilityRole="button"
                accessibilityLabel={`Add ${recipe.title}`}
                onPress={() => addRecipe(recipe)}
                style={styles.addRow}
                testID={`add-recipe-${recipe.id}`}>
                <Text style={styles.addTitle}>{recipe.title}</Text>
                <Text style={styles.addMeta}>Add to {selectedCategory?.name ?? ANY_TIME_LABEL}</Text>
              </Pressable>
            ))}
          </>
        )}
      </KeyboardAwareScrollView>
      {pending ? (
        <View style={[styles.saveBar, { paddingBottom: 8 + bottomInset }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save meal"
            onPress={() => void savePending()}
            style={styles.saveBtn}
            testID="save-planned-meal">
            <Text style={styles.saveBtnText}>Save</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const PENDING_ENTRY_ID = 'pending';

/** Category chip. The label wraps inside the screen width and is not cut off with an ellipsis. */
function SlotChip({
  label,
  active = false,
  onPress,
  testID,
  accessibilityLabel,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      testID={testID}
      style={[styles.slotChip, active && styles.slotChipActive]}>
      <Text style={[styles.slotChipText, active && styles.slotChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  container: { padding: 16, paddingBottom: 48, gap: 8 },
  saveBar: { paddingHorizontal: 16, paddingTop: 8 },
  saveBtn: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  heading: { color: colors.text, fontSize: 20, fontWeight: '700' },
  empty: { color: colors.muted, marginVertical: 4 },
  section: { color: colors.text, fontSize: 18, fontWeight: '700', marginTop: 16 },
  group: { gap: 8, marginTop: 8 },
  groupLabel: { color: colors.muted, fontWeight: '700', textTransform: 'uppercase', fontSize: 12 },
  entry: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  slotChip: {
    minHeight: 44,
    maxWidth: '100%',
    flexShrink: 1,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  slotChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotChipText: { color: colors.muted, fontSize: 14, flexShrink: 1, textAlign: 'center' },
  slotChipTextActive: { color: colors.primaryText, fontWeight: '600' },
  iconBtn: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.input,
  },
  iconBtnText: { color: colors.text, fontSize: 22, fontWeight: '700' },
  servings: { color: colors.text, minWidth: 96, textAlign: 'center' },
  textBtn: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textBtnLabel: { color: colors.primary, fontWeight: '700' },
  remove: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: colors.danger, fontWeight: '700' },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: colors.text,
    backgroundColor: colors.input,
  },
  addRow: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  addTitle: { color: colors.text, fontWeight: '600', fontSize: 16 },
  addMeta: { color: colors.primary, marginTop: 2 },
}));
