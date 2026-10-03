import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { MaxWidthContainer, MAX_CONTENT_WIDTH } from '@/components/layout';
import { useFeature } from '@/hooks/use-feature';
import { createRecipe, parseLines, parseTags } from '@/lib/recipe-utils';
import { colors } from '@/lib/theme';
import { recipeStore } from '@/storage/recipes';
import { PREFERRED_SWEETENER, validateRecipeInput, type RecipeInput } from '@/types/recipe';

export default function AddRecipeScreen() {
  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [steps, setSteps] = useState('');
  const [tags, setTags] = useState('low-carb, diabetic-friendly');
  const tagsAvailable = useFeature('tags').available;
  const [servings, setServings] = useState('4');
  const [carbs, setCarbs] = useState('');
  const [notes, setNotes] = useState('');
  const canImport = useFeature('linkImport').available;
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function onSave() {
    const input: RecipeInput = {
      title,
      ingredients: parseLines(ingredients).map((text) => ({ text })),
      steps: parseLines(steps).map((text) => ({ text })),
      tags: tagsAvailable ? parseTags(tags) : [],
      servings: Number(servings),
      nutrition: { netCarbsG: carbs.trim() === '' ? undefined : Number(carbs), source: 'manual' },
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
        {/* TODO(spec #3,#17,#22): category picker, full nutrition, rating. */}
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
        <Text style={styles.hint}>Sweetener rule: {PREFERRED_SWEETENER} only (no monk fruit).</Text>
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
