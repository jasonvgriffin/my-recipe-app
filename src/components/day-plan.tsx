import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ensureRecipesSeeded } from '@/data/ensure-seed';
import { addDays, formatLongDate } from '@/lib/dates';
import { searchRecipes } from '@/lib/recipe-utils';
import { colors } from '@/lib/theme';
import { mealPlanStore } from '@/storage/meal-plan';
import { recipeStore } from '@/storage/recipes';
import { MEAL_SLOTS, type IsoDate, type MealPlanEntry, type MealSlot } from '@/types/meal-plan';
import type { Recipe } from '@/types/recipe';

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

/**
 * One day's plan: assign a recipe to a meal, move it, or remove it (spec #11).
 * Used in the expanded secondary pane and on the compact day route. Writes go through the meal-plan store.
 */
export function DayPlan({ date, onChanged }: { date: IsoDate; onChanged?: () => void }) {
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [slot, setSlot] = useState<MealSlot>('dinner');
  const [query, setQuery] = useState('');
  const [servingsText, setServingsText] = useState('');

  const load = useCallback(async () => {
    await ensureRecipesSeeded();
    const [dayEntries, all] = await Promise.all([mealPlanStore.entriesForDates([date]), recipeStore.list()]);
    setEntries(dayEntries);
    setRecipes(all);
  }, [date]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load().catch(() => {
        if (active) setRecipes([]);
      });
      return () => {
        active = false;
      };
    }, [load]),
  );

  async function changed() {
    await load();
    onChanged?.();
  }

  const byId = new Map(recipes.map((r) => [r.id, r]));
  const matches = searchRecipes(recipes, query).slice(0, 30);

  async function addRecipe(recipe: Recipe) {
    const already = entries.some((e) => e.recipeId === recipe.id && e.slot === slot);
    if (already) return;
    const servings = Number(servingsText);
    await mealPlanStore.placeEntry({
      date,
      recipeId: recipe.id,
      slot,
      servings: servingsText.trim() && Number.isFinite(servings) && servings > 0 ? servings : undefined,
    });
    setServingsText('');
    await changed();
  }

  async function setSlotFor(entry: MealPlanEntry, next: MealSlot) {
    if (entry.slot === next) return;
    await mealPlanStore.updateEntry(entry.id, { slot: next });
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

  const groups: { key: string; label: string; items: MealPlanEntry[] }[] = [
    { key: 'any', label: 'Any time', items: entries.filter((e) => !e.slot) },
    ...MEAL_SLOTS.map((s) => ({ key: s, label: SLOT_LABEL[s], items: entries.filter((e) => e.slot === s) })),
  ].filter((g) => g.items.length > 0);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      testID="day-plan">
      <Text style={styles.heading}>{formatLongDate(date)}</Text>
      {entries.length === 0 ? <Text style={styles.empty}>Nothing planned</Text> : null}
      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          <Text style={styles.groupLabel}>{group.label}</Text>
          {group.items.map((entry) => {
            const recipe = byId.get(entry.recipeId);
            const title = recipe?.title ?? 'Recipe unavailable';
            const servings = entry.servings ?? recipe?.servings;
            return (
              <View key={entry.id} style={styles.entry} testID={`entry-${entry.id}`}>
                <Text style={styles.title}>{title}</Text>
                <View style={styles.row}>
                  {MEAL_SLOTS.map((s) => (
                    <Pressable
                      key={s}
                      accessibilityRole="button"
                      accessibilityLabel={`Set ${title} to ${SLOT_LABEL[s]}`}
                      accessibilityState={{ selected: entry.slot === s }}
                      onPress={() => setSlotFor(entry, s)}
                      style={[styles.chip, entry.slot === s && styles.chipOn]}>
                      <Text style={[styles.chipText, entry.slot === s && styles.chipTextOn]}>{SLOT_LABEL[s]}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.row}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Decrease servings for ${title}`}
                    onPress={() => shiftServings(entry, recipe, -1)}
                    style={styles.iconBtn}>
                    <Text style={styles.iconBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.servings}>{servings ?? '—'} servings</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Increase servings for ${title}`}
                    onPress={() => shiftServings(entry, recipe, 1)}
                    style={styles.iconBtn}>
                    <Text style={styles.iconBtnText}>+</Text>
                  </Pressable>
                </View>
                <View style={styles.row}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${title} to the previous day`}
                    onPress={() => shiftDay(entry, -1)}
                    style={styles.textBtn}
                    testID={`move-earlier-${entry.id}`}>
                    <Text style={styles.textBtnLabel}>‹ Day</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${title} to the next day`}
                    onPress={() => shiftDay(entry, 1)}
                    style={styles.textBtn}
                    testID={`move-later-${entry.id}`}>
                    <Text style={styles.textBtnLabel}>Day ›</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${title}`}
                    onPress={() => remove(entry)}
                    style={styles.remove}
                    testID={`remove-${entry.id}`}>
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      ))}

      <Text style={styles.section}>Add a recipe</Text>
      <View style={styles.row}>
        {MEAL_SLOTS.map((s) => (
          <Pressable
            key={s}
            accessibilityRole="button"
            accessibilityState={{ selected: slot === s }}
            onPress={() => setSlot(s)}
            style={[styles.chip, slot === s && styles.chipOn]}
            testID={`new-slot-${s}`}>
            <Text style={[styles.chipText, slot === s && styles.chipTextOn]}>{SLOT_LABEL[s]}</Text>
          </Pressable>
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
          <Text style={styles.addMeta}>Add to {SLOT_LABEL[slot]}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48, gap: 8 },
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
  chip: {
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 13 },
  chipTextOn: { color: colors.primaryText, fontWeight: '700' },
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
});
