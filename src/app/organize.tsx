import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { MaxWidthContainer, MAX_CONTENT_WIDTH, useBottomInset } from '@/components/layout';
import { useFeature } from '@/hooks/use-feature';
import { makeStyles, useColors } from '@/hooks/use-theme';
import { recipeStore } from '@/storage/recipes';
import type { Category } from '@/types/recipe';

/**
 * Create, rename and delete categories (spec #3) and rename or remove tags across recipes (spec #20).
 * Assigning a category or tag to one recipe happens on the recipe itself.
 */
export default function OrganizeScreen() {
  const bottomInset = useBottomInset();
  const styles = useStyles();
  const colors = useColors();
  const categoriesOn = useFeature('categories').available;
  const tagsOn = useFeature('tags').available;
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const [tagError, setTagError] = useState('');
  const [pendingDeleteTag, setPendingDeleteTag] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [cats, tagList] = await Promise.all([recipeStore.listCategories(), recipeStore.listTags()]);
    setCategories(cats);
    setTags(tagList);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [cats, tagList] = await Promise.all([recipeStore.listCategories(), recipeStore.listTags()]);
        if (!active) return;
        setCategories(cats);
        setTags(tagList);
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  async function addCategory() {
    const name = categoryName.trim();
    if (!name) {
      setCategoryError('Enter a category name.');
      return;
    }
    const before = new Set((categories ?? []).map((c) => c.id));
    const created = await recipeStore.addCategory(name);
    if (before.has(created.id)) {
      setCategoryError(`“${created.name}” already exists.`);
      return;
    }
    setCategoryName('');
    setCategoryError('');
    await reload();
  }

  async function saveCategoryRename(id: string) {
    const name = editingCategoryName.trim();
    if (!name) {
      setCategoryError('Enter a category name.');
      return;
    }
    await recipeStore.renameCategory(id, name);
    setEditingCategoryId(null);
    setCategoryError('');
    await reload();
  }

  async function confirmDeleteCategory(id: string) {
    await recipeStore.removeCategory(id);
    setPendingDeleteCategory(null);
    await reload();
  }

  async function saveTagRename(from: string) {
    const name = editingTagName.trim().toLowerCase();
    if (!name) {
      setTagError('Enter a tag name.');
      return;
    }
    await recipeStore.renameTag(from, name);
    setEditingTag(null);
    setTagError('');
    await reload();
  }

  async function confirmDeleteTag(tag: string) {
    await recipeStore.deleteTag(tag);
    setPendingDeleteTag(null);
    await reload();
  }

  if (!categoriesOn && !tagsOn) {
    return (
      <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.form}>
        <View style={styles.center} testID="organize-unavailable">
          <Text style={styles.help}>Categories and tags aren’t available.</Text>
        </View>
      </MaxWidthContainer>
    );
  }

  if (!categories) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.form}>
      <Stack.Screen options={{ title: 'Categories & tags' }} />
      <ScrollView contentContainerStyle={[styles.container, { paddingBottom: 48 + bottomInset }]} keyboardShouldPersistTaps="handled" testID="organize-screen">
        {categoriesOn ? (
          <View style={styles.section}>
            <Text style={styles.heading}>Categories</Text>
            <Text style={styles.help}>Any number, any name. Recipes can belong to more than one.</Text>
            <View style={styles.addRow}>
              <TextInput
                style={styles.input}
                value={categoryName}
                onChangeText={setCategoryName}
                placeholder="e.g. Breakfast"
                placeholderTextColor={colors.placeholder}
                testID="new-category-input"
              />
              <Pressable accessibilityRole="button" onPress={addCategory} style={styles.primary} testID="add-category-button">
                <Text style={styles.primaryText}>Add</Text>
              </Pressable>
            </View>
            {categoryError ? <Text style={styles.error}>{categoryError}</Text> : null}
            {categories.length === 0 ? <Text style={styles.help}>No categories yet.</Text> : null}
            {categories.map((c) => (
              <View key={c.id} style={styles.card} testID={`category-row-${c.id}`}>
                {editingCategoryId === c.id ? (
                  <View style={styles.addRow}>
                    <TextInput
                      style={[styles.input, styles.flex]}
                      value={editingCategoryName}
                      onChangeText={setEditingCategoryName}
                      placeholderTextColor={colors.placeholder}
                      testID={`rename-category-input-${c.id}`}
                    />
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => saveCategoryRename(c.id)}
                      style={styles.primary}
                      testID={`save-category-${c.id}`}>
                      <Text style={styles.primaryText}>Save</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => setEditingCategoryId(null)} style={styles.ghost}>
                      <Text style={styles.ghostText}>Cancel</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Text style={styles.name}>{c.name}</Text>
                    <View style={styles.actions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Rename ${c.name}`}
                        onPress={() => {
                          setEditingCategoryId(c.id);
                          setEditingCategoryName(c.name);
                          setPendingDeleteCategory(null);
                        }}
                        style={styles.ghost}
                        testID={`rename-category-${c.id}`}>
                        <Text style={styles.ghostText}>Rename</Text>
                      </Pressable>
                      {pendingDeleteCategory === c.id ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Confirm delete ${c.name}`}
                          onPress={() => confirmDeleteCategory(c.id)}
                          style={styles.danger}
                          testID={`confirm-delete-category-${c.id}`}>
                          <Text style={styles.dangerText}>Confirm delete</Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${c.name}`}
                          onPress={() => {
                            setPendingDeleteCategory(c.id);
                            setEditingCategoryId(null);
                          }}
                          style={styles.danger}
                          testID={`delete-category-${c.id}`}>
                          <Text style={styles.dangerText}>Delete</Text>
                        </Pressable>
                      )}
                    </View>
                  </>
                )}
              </View>
            ))}
          </View>
        ) : null}

        {tagsOn ? (
          <View style={styles.section}>
            <Text style={styles.heading}>Tags</Text>
            <Text style={styles.help}>
              Tags are separate from categories. Renaming or deleting here updates every recipe that uses the tag.
            </Text>
            {tagError ? <Text style={styles.error}>{tagError}</Text> : null}
            {tags.length === 0 ? <Text style={styles.help}>Tags you add on a recipe show up here.</Text> : null}
            {tags.map((tag) => (
              <View key={tag} style={styles.card} testID={`tag-row-${tag}`}>
                {editingTag === tag ? (
                  <View style={styles.addRow}>
                    <TextInput
                      style={[styles.input, styles.flex]}
                      value={editingTagName}
                      onChangeText={setEditingTagName}
                      autoCapitalize="none"
                      placeholderTextColor={colors.placeholder}
                      testID={`rename-tag-input-${tag}`}
                    />
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => saveTagRename(tag)}
                      style={styles.primary}
                      testID={`save-tag-${tag}`}>
                      <Text style={styles.primaryText}>Save</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => setEditingTag(null)} style={styles.ghost}>
                      <Text style={styles.ghostText}>Cancel</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Text style={styles.name}>#{tag}</Text>
                    <View style={styles.actions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Rename tag ${tag}`}
                        onPress={() => {
                          setEditingTag(tag);
                          setEditingTagName(tag);
                          setPendingDeleteTag(null);
                          setTagError('');
                        }}
                        style={styles.ghost}
                        testID={`rename-tag-${tag}`}>
                        <Text style={styles.ghostText}>Rename</Text>
                      </Pressable>
                      {pendingDeleteTag === tag ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Confirm remove tag ${tag}`}
                          onPress={() => confirmDeleteTag(tag)}
                          style={styles.danger}
                          testID={`confirm-delete-tag-${tag}`}>
                          <Text style={styles.dangerText}>Confirm delete</Text>
                        </Pressable>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Delete tag ${tag}`}
                          onPress={() => {
                            setPendingDeleteTag(tag);
                            setEditingTag(null);
                          }}
                          style={styles.danger}
                          testID={`delete-tag-${tag}`}>
                          <Text style={styles.dangerText}>Delete</Text>
                        </Pressable>
                      )}
                    </View>
                  </>
                )}
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </MaxWidthContainer>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { padding: 16, paddingBottom: 48, gap: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  section: { gap: 10 },
  heading: { color: colors.text, fontSize: 20, fontWeight: '700' },
  help: { color: colors.muted, fontSize: 14 },
  error: { color: colors.danger },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  flex: { flex: 1 },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.input,
    color: colors.text,
    fontSize: 16,
  },
  primary: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.primaryText, fontWeight: '700' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
  },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ghost: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: { color: colors.text, fontWeight: '600' },
  danger: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: { color: colors.danger, fontWeight: '600' },
}));
