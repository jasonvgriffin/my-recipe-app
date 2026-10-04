import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { StarRating } from '@/components/star-rating';
import { makeStyles, useColors } from '@/hooks/use-theme';
import type { RecipeCategoryGroup } from '@/lib/recipe-utils';
import { DuplicateCategoryError, recipeStore } from '@/storage/recipes';
import { UNCATEGORIZED_LABEL, type Recipe } from '@/types/recipe';

const UNCATEGORIZED_KEY = 'uncategorized';

/**
 * Recipes tab, browse mode (v1.0.5): one collapsible row per category (Breakfast, Lunch, Dinner by default).
 * Tapping a category expands/collapses the names of its recipes, each with its star rating on the right; tapping a
 * recipe opens it. “Uncategorized” collects recipes without a category and only shows when non-empty. Categories
 * are renamed, added and deleted right here (the old “Manage categories & tags” screen is gone); deleting asks
 * first and moves that category's recipes to Uncategorized.
 */
export function RecipeCategories({
  groups,
  uncategorized,
  showRatings,
  selectedId,
  onOpen,
  onChanged,
  onFieldFocus,
  accessory,
}: {
  groups: RecipeCategoryGroup[];
  uncategorized: Recipe[];
  showRatings: boolean;
  /** Recipe open in the detail pane (two-pane layouts), highlighted. */
  selectedId?: string | null;
  onOpen: (id: string) => void;
  /** Called after a category was added, renamed or deleted. */
  onChanged: () => void;
  /** Scroll the focused name field above the keyboard. */
  onFieldFocus?: () => void;
  /** Shown beside “New category”, and still shown while a new name is being typed. */
  accessory?: ReactNode;
}) {
  const styles = useStyles();
  const colors = useColors();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function saveRename() {
    if (!renaming) return;
    try {
      await recipeStore.renameCategory(renaming.id, renaming.text);
      setRenaming(null);
      setError(null);
      onChanged();
    } catch (e) {
      setError(e instanceof DuplicateCategoryError ? e.message : 'Could not rename the category.');
    }
  }

  async function saveNew() {
    const name = (adding ?? '').trim();
    if (!name) {
      setAdding(null);
      return;
    }
    try {
      await recipeStore.addCategory(name, new Date(), { unique: true });
      setAdding(null);
      setError(null);
      onChanged();
    } catch (e) {
      setError(e instanceof DuplicateCategoryError ? e.message : 'Could not add the category.');
    }
  }

  function confirmDelete(group: RecipeCategoryGroup) {
    const n = group.recipes.length;
    const message =
      n === 0
        ? 'This category is empty.'
        : `Its ${n} recipe${n === 1 ? '' : 's'} will move to ${UNCATEGORIZED_LABEL}. No recipes are deleted.`;
    Alert.alert(`Delete “${group.category.name}”?`, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void recipeStore.removeCategory(group.category.id).then(onChanged);
        },
      },
    ]);
  }

  function recipeRows(key: string, recipes: Recipe[]) {
    if (!expanded.has(key)) return null;
    if (recipes.length === 0) {
      return (
        <Text style={styles.emptyGroup} testID={`category-empty-${key}`}>
          No recipes yet.
        </Text>
      );
    }
    return recipes.map((r) => (
      <Pressable
        key={r.id}
        accessibilityRole="button"
        onPress={() => onOpen(r.id)}
        style={[styles.recipeRow, selectedId === r.id && styles.recipeRowSelected]}
        testID={`recipe-item-${r.id}`}>
        <Text style={styles.recipeTitle}>{r.title}</Text>
        {showRatings && r.rating ? <StarRating value={r.rating} size={14} testID={`recipe-rating-${r.id}`} /> : null}
      </Pressable>
    ));
  }

  function header(key: string, name: string, count: number, actions?: React.ReactNode) {
    const open = expanded.has(key);
    return (
      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${name}, ${count} recipe${count === 1 ? '' : 's'}`}
          onPress={() => toggle(key)}
          style={styles.headerMain}
          testID={`category-header-${key}`}>
          <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={20} color={colors.muted} />
          <Text style={styles.categoryName}>{name}</Text>
          <Text style={styles.count}>{count}</Text>
        </Pressable>
        {actions}
      </View>
    );
  }

  return (
    <View style={styles.wrap} testID="recipe-categories">
      {error ? (
        <Text style={styles.error} testID="category-error">
          {error}
        </Text>
      ) : null}
      {groups.map((group) => {
        const { category } = group;
        const key = category.id;
        const isRenaming = renaming?.id === category.id;
        return (
          <View key={key} style={styles.group} testID={`category-${key}`}>
            {isRenaming ? (
              <View style={styles.editRow}>
                <TextInput
                  value={renaming.text}
                  onChangeText={(text) => setRenaming({ id: category.id, text })}
                  style={styles.input}
                  autoFocus
                  placeholder="Category name"
                  placeholderTextColor={colors.placeholder}
                  onSubmitEditing={() => void saveRename()}
                  onFocus={onFieldFocus}
                  accessibilityLabel={`Rename ${category.name}`}
                  testID={`rename-category-input-${key}`}
                />
                <Pressable accessibilityRole="button" onPress={() => void saveRename()} style={styles.smallBtn} testID={`save-category-${key}`}>
                  <Text style={styles.smallBtnText}>Save</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setRenaming(null);
                    setError(null);
                  }}
                  style={styles.iconBtn}
                  testID={`cancel-rename-category-${key}`}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              header(
                key,
                category.name,
                group.recipes.length,
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Rename category ${category.name}`}
                    onPress={() => {
                      setRenaming({ id: category.id, text: category.name });
                      setError(null);
                    }}
                    style={styles.iconBtn}
                    testID={`rename-category-${key}`}>
                    <Ionicons name="pencil-outline" size={20} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete category ${category.name}`}
                    onPress={() => confirmDelete(group)}
                    style={styles.iconBtn}
                    testID={`delete-category-${key}`}>
                    <Ionicons name="trash-outline" size={20} color={colors.dangerIcon} />
                  </Pressable>
                </>,
              )
            )}
            {recipeRows(key, group.recipes)}
          </View>
        );
      })}
      {uncategorized.length > 0 ? (
        <View style={styles.group} testID={`category-${UNCATEGORIZED_KEY}`}>
          {header(UNCATEGORIZED_KEY, UNCATEGORIZED_LABEL, uncategorized.length)}
          {recipeRows(UNCATEGORIZED_KEY, uncategorized)}
        </View>
      ) : null}
      <View style={[styles.actionRow, adding !== null && styles.actionStack]}>
        {adding !== null ? (
          <View style={styles.addForm}>
            <TextInput
              value={adding}
              onChangeText={setAdding}
              style={styles.input}
              autoFocus
              placeholder="New category name"
              placeholderTextColor={colors.placeholder}
              onSubmitEditing={() => void saveNew()}
              onFocus={onFieldFocus}
              accessibilityLabel="New category name"
              testID="new-category-input"
            />
            <Pressable accessibilityRole="button" onPress={() => void saveNew()} style={styles.smallBtn} testID="save-new-category">
              <Text style={styles.smallBtnText}>Add</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setAdding(null);
                setError(null);
              }}
              style={styles.iconBtn}
              testID="cancel-new-category">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setAdding('');
              setError(null);
            }}
            style={styles.addCategory}
            testID="add-category-button">
            <Text style={styles.addCategoryText}>New category</Text>
          </Pressable>
        )}
        {accessory ? <View style={styles.actionSlot}>{accessory}</View> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: { gap: 10 },
  group: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
  headerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingHorizontal: 12 },
  categoryName: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '700' },
  count: { color: colors.muted, fontSize: 14, fontWeight: '600' },
  iconBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  recipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingVertical: 8,
    paddingLeft: 40,
    paddingRight: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  recipeRowSelected: { backgroundColor: colors.tagBg },
  recipeTitle: { flex: 1, color: colors.text, fontSize: 16 },
  emptyGroup: {
    color: colors.muted,
    paddingLeft: 40,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  editRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  actionStack: { flexDirection: 'column', alignItems: 'stretch' },
  actionSlot: { flex: 1, alignSelf: 'stretch' },
  addForm: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' },
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
  smallBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnText: { color: colors.primaryText, fontWeight: '700' },
  cancelText: { color: colors.muted, fontWeight: '600' },
  addCategory: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 24,
    backgroundColor: colors.primary,
  },
  addCategoryText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  error: { color: colors.danger },
}));
