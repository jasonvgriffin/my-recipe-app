import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { CategoryChips, toggleCategoryId } from '@/components/category-chips';
import { KeyboardAwareScrollView, MaxWidthContainer, MAX_CONTENT_WIDTH, useBottomInset } from '@/components/layout';
import { StarRating } from '@/components/star-rating';
import { useFeature } from '@/hooks/use-feature';
import { createRecipe, parseLines, parseTags } from '@/lib/recipe-utils';
import { makeStyles, useColors } from '@/hooks/use-theme';
import { recipeStore } from '@/storage/recipes';
import { PREFERRED_SWEETENER, validateRecipeInput, type Category, type RecipeInput } from '@/types/recipe';

export default function AddRecipeScreen() {
  const bottomInset = useBottomInset();
  const styles = useStyles();
  const colors = useColors();
  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [steps, setSteps] = useState('');
  const [tags, setTags] = useState('');
  const tagsAvailable = useFeature('tags').available;
  const categoriesOn = useFeature('categories').available;
  const ratingsOn = useFeature('ratings').available;
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [rating, setRatingValue] = useState<number | undefined>();
  const [servings, setServings] = useState('4');
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
    const input: RecipeInput = {
      title,
      ingredients: parseLines(ingredients).map((text) => ({ text })),
      steps: parseLines(steps).map((text) => ({ text })),
      tags: tagsAvailable ? parseTags(tags) : [],
      categoryIds: categoriesOn ? categoryIds : undefined,
      rating: ratingsOn ? rating : undefined,
      servings: Number(servings),
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
      <KeyboardAwareScrollView contentContainerStyle={[styles.container, { paddingBottom: 48 + bottomInset }]}>
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
            <CategoryChips
              categories={categories}
              selectedIds={categoryIds}
              testIDPrefix="add-category"
              onToggle={(id) => setCategoryIds((ids) => toggleCategoryId(ids, id))}
            />
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
              testID="add-form-tags-input"
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
        </View>
        {errors.map((e) => (
          <Text key={e} style={styles.error}>
            • {e}
          </Text>
        ))}
        <Pressable style={[styles.button, saving && styles.disabled]} onPress={onSave} disabled={saving}>
          <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save recipe'}</Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </MaxWidthContainer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
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
}));
