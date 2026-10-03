import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '@/lib/theme';
import { computeRecipeNutrition, nutritionFromFields, type NutritionDensity } from '@/lib/nutrition';
import { barcodeItems } from '@/pantry';
import { recipeStore } from '@/storage/recipes';
import { netCarbs, type NutritionPerServing, type Recipe } from '@/types/recipe';

const DISPLAY: { key: keyof NutritionPerServing; label: string; unit: string }[] = [
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'carbsG', label: 'Carbs', unit: 'g' },
  { key: 'fiberG', label: 'Fiber', unit: 'g' },
  { key: 'netCarbsG', label: 'Net carbs', unit: 'g' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'fatG', label: 'Fat', unit: 'g' },
];

const EDIT_KEYS = ['calories', 'carbsG', 'fiberG', 'netCarbsG', 'proteinG', 'fatG'] as const;

function showValue(n: NutritionPerServing, key: keyof NutritionPerServing): string {
  if (key === 'source') return '';
  if (key === 'netCarbsG') {
    const net = netCarbs(n);
    return net === undefined ? 'unknown' : `${net} g`;
  }
  const v = n[key];
  if (v === undefined) return 'unknown';
  return key === 'calories' ? `${v} kcal` : `${v} g`;
}

function fieldsFrom(n: NutritionPerServing): Record<(typeof EDIT_KEYS)[number], string> {
  return {
    calories: n.calories === undefined ? '' : String(n.calories),
    carbsG: n.carbsG === undefined ? '' : String(n.carbsG),
    fiberG: n.fiberG === undefined ? '' : String(n.fiberG),
    netCarbsG: n.netCarbsG === undefined ? '' : String(n.netCarbsG),
    proteinG: n.proteinG === undefined ? '' : String(n.proteinG),
    fatG: n.fatG === undefined ? '' : String(n.fatG),
  };
}

/**
 * Nutrition per serving (spec #17): the saved numbers, a manual editor, and a computed
 * suggestion from barcode / Open Food Facts data when every ingredient can be weighed.
 */
export function NutritionPanel({ recipe, onChange }: { recipe: Recipe; onChange: (recipe: Recipe) => void }) {
  const recipeKey = `${recipe.id}:${recipe.updatedAt}`;
  const [draft, setDraft] = useState<{ key: string; fields: ReturnType<typeof fieldsFrom>; errors: string[] } | null>(
    null,
  );
  const editing = draft?.key === recipeKey;
  const fields = editing && draft ? draft.fields : fieldsFrom(recipe.nutrition);
  const errors = editing && draft ? draft.errors : [];
  const [sources, setSources] = useState<NutritionDensity[]>([]);

  useEffect(() => {
    let active = true;
    barcodeItems
      .all()
      .then((items) => {
        if (!active) return;
        setSources(
          items.filter((i) => i.nutritionPer100g).map((i) => ({ name: i.name, per100g: i.nutritionPer100g! })),
        );
      })
      .catch(() => {
        if (active) setSources([]);
      });
    return () => {
      active = false;
    };
  }, [recipe.id, recipe.updatedAt]);

  const computed = computeRecipeNutrition(recipe.ingredients, recipe.servings, sources);
  const derivedNet = recipe.nutrition.netCarbsG === undefined && netCarbs(recipe.nutrition) !== undefined;

  async function save(nutrition: NutritionPerServing) {
    const next = await recipeStore.save({ ...recipe, nutrition });
    onChange(next);
    setDraft(null);
  }

  async function saveManual() {
    const parsed = nutritionFromFields(fields, 'manual');
    if (!parsed.ok) {
      setDraft({ key: recipeKey, fields, errors: parsed.errors });
      return;
    }
    await save(parsed.nutrition);
  }

  return (
    <View style={styles.box} testID="nutrition-panel">
      <Text style={styles.heading}>Nutrition per serving</Text>
      <View style={styles.grid}>
        {DISPLAY.map((row) => (
          <View key={row.key} style={styles.cell} testID={`nutrition-${row.key}`}>
            <Text style={styles.value}>{showValue(recipe.nutrition, row.key)}</Text>
            <Text style={styles.cellLabel}>{row.label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.meta}>
        {recipe.nutrition.source === 'computed'
          ? 'Computed from ingredient nutrition'
          : recipe.nutrition.source === 'imported'
            ? 'Imported with the recipe'
            : recipe.nutrition.source === 'manual'
              ? 'Entered by hand'
              : 'Source unknown'}
        {derivedNet ? ' · net carbs are carbs minus fiber' : ''}
      </Text>
      {computed.complete ? (
        <View style={styles.computed} testID="nutrition-computed">
          <Text style={styles.computedTitle}>Computed from barcode nutrition</Text>
          <Text style={styles.meta}>
            {computed.nutrition.calories !== undefined ? `${computed.nutrition.calories} kcal` : 'calories unknown'}
            {' · '}
            {computed.nutrition.netCarbsG !== undefined
              ? `${computed.nutrition.netCarbsG} g net carbs`
              : 'net carbs unknown'}
            {' · '}
            {computed.nutrition.proteinG !== undefined ? `${computed.nutrition.proteinG} g protein` : 'protein unknown'}
            {' · '}
            {computed.nutrition.fatG !== undefined ? `${computed.nutrition.fatG} g fat` : 'fat unknown'}
          </Text>
          <Pressable
            accessibilityRole="button"
            testID="nutrition-use-computed"
            style={styles.secondaryBtn}
            onPress={() => save(computed.nutrition)}>
            <Text style={styles.secondaryBtnText}>Use computed values</Text>
          </Pressable>
        </View>
      ) : computed.missing.length > 0 && sources.length > 0 ? (
        <Text style={styles.meta} testID="nutrition-computed-missing">
          Can’t compute a full per-serving total yet — no usable nutrition for {computed.missing.join(', ')}. Missing
          amounts stay unknown, not zero.
        </Text>
      ) : null}
      {editing ? (
        <View style={styles.form}>
          <Text style={styles.meta}>Leave a field blank when you don’t know it. Blank is unknown, not zero.</Text>
          {EDIT_KEYS.map((key) => (
            <View key={key} style={styles.field}>
              <Text style={styles.cellLabel}>{DISPLAY.find((d) => d.key === key)?.label}</Text>
              <TextInput
                value={fields[key]}
                onChangeText={(v) =>
                  setDraft({
                    key: recipeKey,
                    fields: { ...fields, [key]: v },
                    errors,
                  })
                }
                keyboardType="decimal-pad"
                placeholder="unknown"
                placeholderTextColor={colors.placeholder}
                style={styles.input}
                testID={`nutrition-input-${key}`}
              />
            </View>
          ))}
          {errors.map((e) => (
            <Text key={e} style={styles.error}>
              • {e}
            </Text>
          ))}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" style={styles.secondaryBtn} onPress={() => setDraft(null)}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              testID="nutrition-save"
              style={styles.primaryBtn}
              onPress={saveManual}>
              <Text style={styles.primaryBtnText}>Save nutrition</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          testID="nutrition-edit"
          style={styles.secondaryBtn}
          onPress={() => setDraft({ key: recipeKey, fields: fieldsFrom(recipe.nutrition), errors: [] })}>
          <Text style={styles.secondaryBtnText}>Edit nutrition</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  heading: { color: colors.text, fontSize: 18, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    width: '30%',
    flexGrow: 1,
    minWidth: 96,
    paddingVertical: 8,
    alignItems: 'center',
  },
  value: { color: colors.text, fontSize: 18, fontWeight: '700' },
  cellLabel: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  computed: { gap: 6, paddingTop: 4 },
  computedTitle: { color: colors.text, fontWeight: '600' },
  form: { gap: 8 },
  field: { gap: 4 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.input,
    color: colors.text,
    fontSize: 16,
    minHeight: 44,
  },
  error: { color: colors.danger },
  actions: { flexDirection: 'row', gap: 8 },
  secondaryBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  secondaryBtnText: { color: colors.primary, fontWeight: '700' },
  primaryBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: colors.primaryText, fontWeight: '700' },
});
