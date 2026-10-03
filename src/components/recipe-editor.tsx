import { useState, type ReactNode } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useFeature } from '@/hooks/use-feature';
import { deleteLocalPhoto, PhotoPermissionError, pickRecipePhoto } from '@/lib/photos';
import {
  applyRecipeEdit,
  editorStateToInput,
  moveItem,
  recipeToEditorState,
  type IngredientDraft,
  type RecipeEditorState,
  type StepDraft,
} from '@/lib/recipe-edit';
import { colors } from '@/lib/theme';
import { recipeStore } from '@/storage/recipes';
import { PREFERRED_SWEETENER, type Recipe } from '@/types/recipe';

/** Full recipe editor: title, notes, ingredients (add/delete/reorder/substitute), steps with timers (spec #2, #4, #6, #7). */
export function RecipeEditor({ recipe, onSaved }: { recipe: Recipe; onSaved: (recipe: Recipe) => void }) {
  const photos = useFeature('photos').available;
  const [state, setState] = useState<RecipeEditorState>(() => recipeToEditorState(recipe));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function patch(partial: Partial<RecipeEditorState>) {
    setState((current) => ({ ...current, ...partial }));
  }

  async function choosePhoto(source: 'camera' | 'library') {
    try {
      const uri = await pickRecipePhoto(source, recipe.id);
      if (!uri) return;
      if (state.photoUri && state.photoUri !== uri) deleteLocalPhoto(state.photoUri);
      patch({ photoUri: uri });
    } catch (e) {
      const message = e instanceof PhotoPermissionError ? e.message : 'Could not add that photo.';
      Alert.alert('Photo', message);
    }
  }

  function removePhoto() {
    deleteLocalPhoto(state.photoUri);
    patch({ photoUri: undefined });
  }

  async function onSave() {
    const built = editorStateToInput(state, recipe);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setSaving(true);
    try {
      const next = applyRecipeEdit(recipe, built.input);
      await recipeStore.save(next);
      onSaved(next);
    } catch (e) {
      Alert.alert('Could not save recipe', String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" testID="recipe-editor">
      <Field label="Title">
        <TextInput
          value={state.title}
          onChangeText={(title) => patch({ title })}
          placeholder="Recipe title"
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          testID="edit-title"
        />
      </Field>
      <Field label="Description">
        <TextInput
          value={state.description}
          onChangeText={(description) => patch({ description })}
          placeholder="Optional"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, styles.multiline]}
          multiline
          testID="edit-description"
        />
      </Field>
      {photos ? (
        <Field label="Photo (optional)">
          {state.photoUri ? (
            <Image source={{ uri: state.photoUri }} style={styles.photo} testID="edit-photo" accessibilityLabel="Recipe photo" />
          ) : (
            <Text style={styles.hint}>No photo yet. Camera or gallery — stored on this device.</Text>
          )}
          <View style={styles.row}>
            <SmallButton label="Take photo" onPress={() => choosePhoto('camera')} testID="take-photo-button" />
            <SmallButton label="Choose photo" onPress={() => choosePhoto('library')} testID="choose-photo-button" />
            {state.photoUri ? <SmallButton label="Remove" onPress={removePhoto} testID="remove-photo-button" /> : null}
          </View>
        </Field>
      ) : null}
      <Text style={styles.section}>Ingredients</Text>
      <Text style={styles.hint}>Add, remove, reorder, or note a substitution ({PREFERRED_SWEETENER} only — no monk fruit).</Text>
      {state.ingredients.map((row, index) => (
        <IngredientRow
          key={index}
          row={row}
          index={index}
          count={state.ingredients.length}
          onChange={(next) => patch({ ingredients: replaceAt(state.ingredients, index, next) })}
          onMove={(direction) => patch({ ingredients: moveItem(state.ingredients, index, direction) })}
          onRemove={() => patch({ ingredients: state.ingredients.filter((_, i) => i !== index) })}
        />
      ))}
      <SmallButton
        label="Add ingredient"
        onPress={() => patch({ ingredients: [...state.ingredients, { text: '', substitutionNote: '' }] })}
        testID="add-ingredient"
      />
      <Text style={styles.section}>Steps</Text>
      <Text style={styles.hint}>Timer is in minutes. Leave it blank to detect a time written in the step.</Text>
      {state.steps.map((row, index) => (
        <StepRow
          key={index}
          row={row}
          index={index}
          count={state.steps.length}
          onChange={(next) => patch({ steps: replaceAt(state.steps, index, next) })}
          onMove={(direction) => patch({ steps: moveItem(state.steps, index, direction) })}
          onRemove={() => patch({ steps: state.steps.filter((_, i) => i !== index) })}
        />
      ))}
      <SmallButton
        label="Add step"
        onPress={() => patch({ steps: [...state.steps, { text: '', minutes: '' }] })}
        testID="add-step"
      />
      <Field label="Notes">
        <TextInput
          value={state.notes}
          onChangeText={(notes) => patch({ notes })}
          placeholder="Personal notes"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, styles.multiline]}
          multiline
          testID="edit-notes"
        />
      </Field>
      <Field label="Source link">
        <TextInput
          value={state.sourceUrl}
          onChangeText={(sourceUrl) => patch({ sourceUrl })}
          placeholder="https://"
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          testID="edit-source"
        />
      </Field>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field label="Servings">
            <TextInput
              value={state.servings}
              onChangeText={(servings) => patch({ servings })}
              keyboardType="numeric"
              placeholderTextColor={colors.placeholder}
              style={styles.input}
              testID="edit-servings"
            />
          </Field>
        </View>
        <View style={styles.flex}>
          <Field label="Net carbs / serving (g)">
            <TextInput
              value={state.netCarbs}
              onChangeText={(netCarbs) => patch({ netCarbs })}
              keyboardType="decimal-pad"
              placeholder="unknown"
              placeholderTextColor={colors.placeholder}
              style={styles.input}
              testID="edit-carbs"
            />
          </Field>
        </View>
      </View>
      {errors.map((error) => (
        <Text key={error} style={styles.error}>
          • {error}
        </Text>
      ))}
      <Pressable
        style={[styles.save, saving && styles.disabled]}
        onPress={onSave}
        disabled={saving}
        accessibilityRole="button"
        testID="save-recipe-button">
        <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save changes'}</Text>
      </Pressable>
    </ScrollView>
  );
}

function IngredientRow({
  row,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  row: IngredientDraft;
  index: number;
  count: number;
  onChange: (row: IngredientDraft) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.card}>
      <TextInput
        value={row.text}
        onChangeText={(text) => onChange({ ...row, text })}
        placeholder={`Ingredient ${index + 1}`}
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        testID={`ingredient-text-${index}`}
      />
      <TextInput
        value={row.substitutionNote}
        onChangeText={(substitutionNote) => onChange({ ...row, substitutionNote })}
        placeholder={`Substitution (optional), e.g. ${PREFERRED_SWEETENER} instead of sugar`}
        placeholderTextColor={colors.placeholder}
        style={styles.input}
        testID={`ingredient-sub-${index}`}
      />
      <View style={styles.row}>
        <SmallButton label="Up" onPress={() => onMove(-1)} disabled={index === 0} testID={`ingredient-up-${index}`} />
        <SmallButton
          label="Down"
          onPress={() => onMove(1)}
          disabled={index === count - 1}
          testID={`ingredient-down-${index}`}
        />
        <SmallButton label="Remove" onPress={onRemove} testID={`ingredient-remove-${index}`} />
      </View>
    </View>
  );
}

function StepRow({
  row,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  row: StepDraft;
  index: number;
  count: number;
  onChange: (row: StepDraft) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.card}>
      <TextInput
        value={row.text}
        onChangeText={(text) => onChange({ ...row, text })}
        placeholder={`Step ${index + 1}`}
        placeholderTextColor={colors.placeholder}
        style={[styles.input, styles.multiline]}
        multiline
        testID={`step-text-${index}`}
      />
      <TextInput
        value={row.minutes}
        onChangeText={(minutes) => onChange({ ...row, minutes })}
        placeholder="Timer minutes (optional)"
        placeholderTextColor={colors.placeholder}
        keyboardType="decimal-pad"
        style={styles.input}
        testID={`step-minutes-${index}`}
      />
      <View style={styles.row}>
        <SmallButton label="Up" onPress={() => onMove(-1)} disabled={index === 0} testID={`step-up-${index}`} />
        <SmallButton label="Down" onPress={() => onMove(1)} disabled={index === count - 1} testID={`step-down-${index}`} />
        <SmallButton label="Remove" onPress={onRemove} testID={`step-remove-${index}`} />
      </View>
    </View>
  );
}

function replaceAt<T>(items: T[], index: number, next: T): T[] {
  return items.map((item, i) => (i === index ? next : item));
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function SmallButton({
  label,
  onPress,
  testID,
  disabled,
}: {
  label: string;
  onPress: () => void;
  testID: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.small, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      testID={testID}>
      <Text style={styles.smallText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  field: { marginBottom: 14 },
  label: { fontWeight: '600', marginBottom: 6, color: colors.text },
  section: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 8, marginBottom: 4 },
  hint: { color: colors.muted, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.input,
    color: colors.text,
    fontSize: 16,
    marginBottom: 8,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    backgroundColor: colors.card,
  },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  flex: { flex: 1 },
  photo: { width: '100%', height: 180, borderRadius: 10, marginBottom: 8, backgroundColor: colors.input },
  small: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.input,
  },
  smallText: { color: colors.text, fontWeight: '600' },
  error: { color: colors.danger, marginBottom: 4 },
  save: {
    marginTop: 12,
    backgroundColor: colors.primary,
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.5 },
});
