import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MaxWidthContainer, MAX_CONTENT_WIDTH, TwoPaneLayout } from '@/components/layout';
import { RecipeDetail } from '@/components/recipe-detail';
import { RecipeFilters } from '@/components/recipe-filters';
import { StarRating } from '@/components/star-rating';
import { useFeature } from '@/hooks/use-feature';
import { useSettings } from '@/hooks/use-settings';
import { useWindowSizeClass } from '@/hooks/use-window-size-class';
import {
  browseFilters,
  DEFAULT_BROWSE,
  effectiveRecipeSort,
  filterRecipes,
  isBrowseFiltered,
  sortRecipes,
  type RecipeBrowse,
} from '@/lib/recipe-utils';
import { colors } from '@/lib/theme';
import { recipeStore } from '@/storage/recipes';
import { isLowCarb, netCarbs, type Category, type Recipe } from '@/types/recipe';

export default function RecipeListScreen() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [browse, setBrowse] = useState<RecipeBrowse>(DEFAULT_BROWSE);
  /** Selected recipe for the detail pane (medium/expanded). Kept across fold/unfold. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { isTwoPane } = useWindowSizeClass();
  const settings = useSettings();
  const showRatings = useFeature('ratings').available;
  const showTags = useFeature('tags').available;
  const showCategories = useFeature('categories').available;

  const applyCatalog = useCallback((list: Recipe[], cats: Category[], tags: string[]) => {
    setRecipes(list);
    setCategories(cats);
    setTagNames(tags);
    setCatalogReady(true);
    setBrowse((b) => ({
      ...b,
      categoryId: b.categoryId && cats.some((c) => c.id === b.categoryId) ? b.categoryId : undefined,
      tags: b.tags.filter((t) => tags.includes(t)),
    }));
  }, []);

  const reload = useCallback(async () => {
    const [list, cats, tags] = await Promise.all([
      recipeStore.list(),
      recipeStore.listCategories(),
      recipeStore.listTags(),
    ]);
    applyCatalog(list, cats, tags);
  }, [applyCatalog]);

  function openRecipe(id: string) {
    if (isTwoPane) setSelectedId(id);
    else router.push({ pathname: '/recipe/[id]', params: { id } });
  }

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        await recipeStore.seedIfNeeded();
        const [list, cats, tags] = await Promise.all([
          recipeStore.list(),
          recipeStore.listCategories(),
          recipeStore.listTags(),
        ]);
        if (!active) return;
        applyCatalog(list, cats, tags);
      })();
      return () => {
        active = false;
      };
    }, [applyCatalog]),
  );

  function changeBrowse(next: RecipeBrowse) {
    if (catalogReady && next.categoryId && !categories.some((c) => c.id === next.categoryId)) {
      next = { ...next, categoryId: undefined };
    }
    if (catalogReady) next = { ...next, tags: next.tags.filter((t) => tagNames.includes(t)) };
    setBrowse(next);
  }

  if (!recipes) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const filteredBrowse: RecipeBrowse = {
    ...browse,
    categoryId: showCategories ? browse.categoryId : undefined,
    tags: showTags ? browse.tags.filter((t) => tagNames.includes(t)) : [],
    minRating: showRatings ? browse.minRating : undefined,
    sort: effectiveRecipeSort(browse.sort, showRatings),
  };
  const visible = sortRecipes(
    filterRecipes(
      recipes,
      browseFilters(filteredBrowse, {
        recentDays: settings.cookedRecentlyDays,
        categories: showCategories,
        tags: showTags,
        ratings: showRatings,
      }),
    ),
    filteredBrowse.sort,
  );
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name;

  const list = (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search title, ingredients, notes, or tags"
        value={browse.keyword}
        onChangeText={(keyword) => setBrowse((b) => ({ ...b, keyword }))}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.placeholder}
        accessibilityLabel="Search recipes"
        testID="search-input"
      />
      <FlatList
        data={visible}
        keyExtractor={(r) => r.id}
        extraData={selectedId}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <RecipeFilters
            browse={filteredBrowse}
            onChange={changeBrowse}
            recentDays={settings.cookedRecentlyDays}
            categories={categories}
            showCategories={showCategories}
            tagNames={tagNames}
            showTags={showTags}
            showRatings={showRatings}
            showOrganize={showCategories || showTags}
            filtersActive={isBrowseFiltered(filteredBrowse)}
            onClear={() => setBrowse((b) => ({ ...DEFAULT_BROWSE, sort: b.sort }))}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {isBrowseFiltered(filteredBrowse)
              ? 'No recipes match.'
              : 'No recipes yet. Tap “Add recipe” to create one.'}
          </Text>
        }
        renderItem={({ item }) => {
          const names = showCategories
            ? item.categoryIds.map(categoryName).filter((n): n is string => Boolean(n))
            : [];
          return (
            <Pressable
              style={[styles.card, isTwoPane && item.id === selectedId && styles.cardSelected]}
              onPress={() => openRecipe(item.id)}
              testID={`recipe-item-${item.id}`}>
              <Text style={styles.title}>{item.title}</Text>
              {showRatings && item.rating ? (
                <StarRating value={item.rating} testID={`recipe-rating-${item.id}`} size={16} />
              ) : null}
              <Text style={styles.meta}>
                {netCarbs(item.nutrition) ?? '?'} g net carbs/serving · {item.servings} servings
                {isLowCarb(item) ? ' · low-carb' : ''}
                {item.cooked ? ' · cooked' : ''}
              </Text>
              {names.length > 0 ? <Text style={styles.meta}>{names.join(' · ')}</Text> : null}
              {showTags && item.tags.length > 0 ? (
                <Text style={styles.tags}>{item.tags.map((t) => `#${t}`).join('  ')}</Text>
              ) : null}
            </Pressable>
          );
        }}
      />
      <Link href="/add" asChild>
        <Pressable style={styles.fab} accessibilityRole="button" testID="add-recipe-button">
          <Text style={styles.fabText}>+ Add recipe</Text>
        </Pressable>
      </Link>
    </View>
  );

  return (
    <TwoPaneLayout
      testID="recipes-layout"
      primary={<MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.list}>{list}</MaxWidthContainer>}
      secondary={
        selectedId ? (
          <RecipeDetail
            key={selectedId}
            id={selectedId}
            categories={categories}
            onChange={reload}
            onDeleted={() => {
              setSelectedId(null);
              reload();
            }}
          />
        ) : null
      }
      placeholder={<Text style={styles.empty}>Select a recipe to see it here.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  search: {
    margin: 12,
    marginBottom: 0,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    color: colors.text,
  },
  list: { padding: 12, paddingBottom: 96, gap: 10 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardSelected: { borderColor: colors.primary },
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  meta: { marginTop: 4, color: colors.muted },
  tags: { marginTop: 6, color: colors.primary, fontSize: 13 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: 28,
    elevation: 4,
  },
  fabText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
});
