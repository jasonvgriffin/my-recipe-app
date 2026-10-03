import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { CategoryChips } from '@/components/category-chips';
import { MaxWidthContainer, MAX_CONTENT_WIDTH } from '@/components/layout';
import { StarRating } from '@/components/star-rating';
import { useFeature } from '@/hooks/use-feature';
import { parseNutritionField } from '@/lib/nutrition';
import { createRecipe, parseLines, parseTags } from '@/lib/recipe-utils';
import { colors } from '@/lib/theme';
import { recipeStore } from '@/storage/recipes';
import { PREFERRED_SWEETENER, validateRecipeInput, type Category, type NutritionPerServing, type RecipeInput } from '@/types/recipe';

export default function AddRecipeScreen() {
  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [steps, setSteps] = useState('');
  const [tags, setTags] = useState('low-carb, diabetic-friendly');
  const tagsAvailable = useFeature('tags').available;
  const categoriesOn = useFeature('categories').available;
  const ratingsOn = useFeature('ratings').available;
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [rating, setRatingValue] = useState<number | undefined>();
  const [servings, setServings] = useState('4');
  const [carbs, setCarbs] = useState('');
  const [calories, setCalories] = useState('');
  const [carbsTotal, setCarbsTotal] = useState('');
  const [fiber, setFiber] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const nutritionAvailable = useFeature('nutrition').available;
  const [notes, setNotes] = useState('');
  const canImport = useFeature('linkImport').available;
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!categoriesOn) return;
      let active = true;
      recipeStore.listCategories().then((list) => {
        if (active) setCategories(list);
      });
      return () => {
        active = false;
      };
    }, [categoriesOn]),
  );

  async function createCategory() {
    const name = newCategory.trim();
    if (!name) return;
    const created = await recipeStore.addCategory(name);
    setCategories(await recipeStore.listCategories());
    setCategoryIds((ids) => (ids.includes(created.id) ? ids : [...ids, created.id]));
    setNewCategory('');
  }

  async function onSave() {
    const nutrition: NutritionPerServing = {
      netCarbsG: carbs.trim() === '' ? undefined : Number(carbs),
      source: 'manual',
    };
    if (nutritionAvailable) {
      const extra = {
        calories: parseNutritionField(calories),
        carbsG: parseNutritionField(carbsTotal),
        fiberG: parseNutritionField(fiber),
        proteinG: parseNutritionField(protein),
        fatG: parseNutritionField(fat),
      };
      for (const [key, value] of Object.entries(extra)) {
        if (value === 'invalid') {
          setErrors([`${key} must be a number of 0 or more.`]);
          return;
        }
        if (value !== undefined) (nutrition as Record<string, number>)[key] = value;
      }
    }
    const input: RecipeInput = {
      title,
      ingredients: parseLines(ingredients).map((text) => ({ text })),
      steps: parseLines(steps).map((text) => ({ text })),
      tags: tagsAvailable ? parseTags(tags) : [],
      categoryIds: categoriesOn ? categoryIds : undefined,
      rating: ratingsOn ? rating : undefined,
      servings: Number(servings),
      nutrition,
      notes: notes.trim() || undefined,
    };
    const result = validateRecipeInput(input);
    setErrors(result.errors);
    if (!result.ok) return;
    setSaving(true);
    try {
      await recipeStore.save(createRecipe(input));
      router.back();
    } catch (e) {
      Alert.alert('Could not save recipe', String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.form}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {canImport ? (
          <Link href="/import" asChild>
            <Pressable style={styles.importLink} accessibilityRole="button" testID="add-import-link">
              <Text style={styles.importLinkText}>Import from a link instead</Text>
            </Pressable>
          </Link>
        ) : null}
        <Field label="Title">
          <TextInput
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Cauliflower Mac & Cheese"
          />
        </Field>
        <Field label="Ingredients (one per line)">
          <TextInput
            placeholderTextColor={colors.placeholder}
            style={[styles.input, styles.multiline]}
            value={ingredients}
            onChangeText={setIngredients}
            multiline
            placeholder={`1 head cauliflower\n2 tbsp ${PREFERRED_SWEETENER}`}
          />
        </Field>
        <Field label="Steps (one per line)">
          <TextInput
            placeholderTextColor={colors.placeholder}
            style={[styles.input, styles.multiline]}
            value={steps}
            onChangeText={setSteps}
            multiline
            placeholder={'Preheat oven to 400°F\nRoast 25 minutes'}
          />
        </Field>
        <Field label="Notes (optional)">
          <TextInput
            placeholderTextColor={colors.placeholder}
            style={[styles.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Personal notes"
            testID="notes-input"
          />
        </Field>
        {categoriesOn ? (
          <Field label="Categories">
            {categories.length > 0 ? (
              <CategoryChips
                categories={categories}
                selectedIds={categoryIds}
                testIDPrefix="add-category"
                onToggle={(id) =>
                  setCategoryIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
                }
              />
            ) : null}
            <View style={styles.categoryAdd}>
              <TextInput
                placeholderTextColor={colors.placeholder}
                style={[styles.input, styles.flex]}
                value={newCategory}
                onChangeText={setNewCategory}
                placeholder="New category"
                testID="add-form-category-input"
              />
              <Pressable
                accessibilityRole="button"
                onPress={createCategory}
                style={styles.smallButton}
                testID="add-form-category-button">
                <Text style={styles.smallButtonText}>Add</Text>
              </Pressable>
            </View>
          </Field>
        ) : null}
        {ratingsOn ? (
          <Field label="Rating">
            <StarRating value={rating} onChange={setRatingValue} testID="add-rating" />
          </Field>
        ) : null}
        {tagsAvailable ? (
          <Field label="Tags (comma separated)">
            <TextInput
              placeholderTextColor={colors.placeholder}
              style={styles.input}
              value={tags}
              onChangeText={setTags}
              autoCapitalize="none"
            />
          </Field>
        ) : null}
        <View style={styles.row}>
          <View style={styles.flex}>
            <Field label="Servings">
              <TextInput
                placeholderTextColor={colors.placeholder}
                style={styles.input}
                value={servings}
                onChangeText={setServings}
                keyboardType="numeric"
              />
            </Field>
          </View>
          <View style={styles.flex}>
            <Field label="Net carbs / serving (g)">
              <TextInput
                placeholderTextColor={colors.placeholder}
                style={styles.input}
                value={carbs}
                onChangeText={setCarbs}
                keyboardType="decimal-pad"
                testID="carbs-input"
              />
            </Field>
          </View>
        </View>
        {nutritionAvailable ? (
          <>
            {(
              [
                ['Calories', calories, setCalories, 'nutrition-add-calories'],
                ['Total carbs (g)', carbsTotal, setCarbsTotal, 'nutrition-add-carbs'],
                ['Fiber (g)', fiber, setFiber, 'nutrition-add-fiber'],
                ['Protein (g)', protein, setProtein, 'nutrition-add-protein'],
                ['Fat (g)', fat, setFat, 'nutrition-add-fat'],
              ] as const
            ).map(([label, value, setValue, testID]) => (
              <Field key={testID} label={`${label} — optional`}>
                <TextInput
                  placeholderTextColor={colors.placeholder}
                  style={styles.input}
                  value={value}
                  onChangeText={setValue}
                  keyboardType="decimal-pad"
                  placeholder="unknown"
                  testID={testID}
                />
              </Field>
            ))}
          </>
        ) : null}
        <Text style={styles.hint}>
          Leave nutrition blank if you don’t know it — blank is unknown, not zero. Sweetener rule: {PREFERRED_SWEETENER}{' '}
          only (no monk fruit).
        </Text>
        {errors.map((e) => (
          <Text key={e} style={styles.error}>
            • {e}
          </Text>
        ))}
        <Pressable style={[styles.button, saving && styles.disabled]} onPress={onSave} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save recipe'}</Text>
        </Pressable>
      </ScrollView>
    </MaxWidthContainer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  field: { marginBottom: 14 },
  label: { fontWeight: '600', marginBottom: 6, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.input,
    color: colors.text,
    fontSize: 16,
  },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  categoryAdd: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  smallButton: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButtonText: { color: colors.primaryText, fontWeight: '700' },
  hint: { color: colors.muted, marginBottom: 8 },
  error: { color: colors.danger, marginBottom: 4 },
  button: {
    marginTop: 12,
    backgroundColor: colors.primary,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  importLink: { minHeight: 44, justifyContent: 'center', marginBottom: 12 },
  importLinkText: { color: colors.primary, fontWeight: '700', fontSize: 16 },
});
