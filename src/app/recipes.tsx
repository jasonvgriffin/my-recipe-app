import { Link, router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MaxWidthContainer, MAX_CONTENT_WIDTH, TwoPaneLayout, useBottomInset } from '@/components/layout';
import { RecipeDetail } from '@/components/recipe-detail';
import { RecipeFilters } from '@/components/recipe-filters';
import { StarRating } from '@/components/star-rating';
import { useFeature } from '@/hooks/use-feature';
import { useOnDataChange } from '@/hooks/use-on-data-change';
import { usePdfExport } from '@/hooks/use-pdf-export';
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
import { makeStyles, useColors } from '@/hooks/use-theme';
import { recipeStore } from '@/storage/recipes';
import type { Category, Recipe } from '@/types/recipe';

/**
 * Existing Recipes (spec #8, #9, #23): search box, filters, list and (medium/expanded) the detail beside it.
 * Opened from the Recipes tab's "Existing Recipes" and "Search" buttons (`?focus=search` focuses the box).
 * v1.0.3: “Select” picks several recipes for one PDF (`usePdfExport`); `?select=pdf` (Recipes-tab “Share Recipes”
 * and the + menu “Share Recipe”) opens straight into that mode — pick, then “Share PDF” opens the share sheet.
 */
export default function RecipeListScreen() {
  const bottomInset = useBottomInset();
  const styles = useStyles();
  const colors = useColors();
  const { focus, select } = useLocalSearchParams<{ focus?: string; select?: string }>();
  const pdf = usePdfExport();
  const sharePdfMode = select === 'pdf';
  const [selectingState, setSelecting] = useState(sharePdfMode);
  // Picking only exists while PDF export is available (locked → the list behaves normally).
  const selecting = selectingState && pdf.available;
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [browse, setBrowse] = useState<RecipeBrowse>(DEFAULT_BROWSE);
  const canImport = useFeature('linkImport').available;
  /** Selected recipe for the detail pane (medium/expanded). Kept across fold/unfold. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { isTwoPane } = useWindowSizeClass();
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
  useOnDataChange(() => {
    void reload();
  });

  function togglePicked(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function stopSelecting() {
    setSelecting(false);
    setPicked(new Set());
  }

  async function sharePicked(all: Recipe[]) {
    const chosen = all.filter((r) => picked.has(r.id));
    if (chosen.length === 0) return;
    const ok = await pdf.exportPdf(chosen);
    if (ok && !sharePdfMode) stopSelecting();
  }

  function openRecipe(id: string) {
    if (selecting) {
      togglePicked(id);
      return;
    }
    if (isTwoPane) setSelectedId(id);
    else router.push({ pathname: '/recipe/[id]', params: { id } });
  }

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
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
        autoFocus={focus === 'search'}
        testID="search-input"
      />
      {sharePdfMode ? <Stack.Screen options={{ title: 'Share recipes' }} /> : null}
      {pdf.available && selecting ? (
        <View style={styles.selectBar} testID="pdf-select-bar">
          <Text style={styles.selectHint}>
            {picked.size === 0
              ? 'Tap recipes to add them to one PDF.'
              : `${picked.size} selected`}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setPicked(new Set(visible.map((r) => r.id)))}
            style={styles.selectAction}
            testID="pdf-select-all">
            <Text style={styles.selectActionText}>All</Text>
          </Pressable>
          {sharePdfMode ? null : (
            <Pressable accessibilityRole="button" onPress={stopSelecting} style={styles.selectAction} testID="pdf-select-cancel">
              <Text style={styles.selectActionText}>Cancel</Text>
            </Pressable>
          )}
        </View>
      ) : null}
      {pdf.error ? (
        <Text style={styles.pdfError} testID="export-pdf-error">
          {pdf.error}
        </Text>
      ) : null}
      {canImport && !selecting ? (
        <Link href="/import" asChild>
          <Pressable style={styles.importLink} accessibilityRole="button" testID="import-recipe-button">
            <Text style={styles.importLinkText}>Import from link</Text>
          </Pressable>
        </Link>
      ) : null}
      {pdf.available && !selecting && recipes.length > 0 ? (
        <Pressable
          style={styles.importLink}
          accessibilityRole="button"
          accessibilityHint="Pick several recipes to export as one PDF"
          onPress={() => setSelecting(true)}
          testID="pdf-select-button">
          <Text style={styles.importLinkText}>Select recipes for PDF</Text>
        </Pressable>
      ) : null}
      <FlatList
        data={visible}
        keyExtractor={(r) => r.id}
        extraData={[selectedId, selecting, picked]}
        contentContainerStyle={[styles.list, { paddingBottom: 96 + bottomInset }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <RecipeFilters
            browse={filteredBrowse}
            onChange={changeBrowse}
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
              : 'No recipes yet. Tap “+ Add recipe” to create or import one.'}
          </Text>
        }
        renderItem={({ item }) => {
          const names = showCategories
            ? item.categoryIds.map(categoryName).filter((n): n is string => Boolean(n))
            : [];
          return (
            <Pressable
              style={[
                styles.card,
                ((isTwoPane && !selecting && item.id === selectedId) || (selecting && picked.has(item.id))) &&
                  styles.cardSelected,
              ]}
              onPress={() => openRecipe(item.id)}
              accessibilityRole={selecting ? 'checkbox' : 'button'}
              accessibilityState={selecting ? { checked: picked.has(item.id) } : undefined}
              testID={`recipe-item-${item.id}`}>
              <Text style={styles.title}>
                {selecting ? (picked.has(item.id) ? '☑ ' : '☐ ') : ''}
                {item.title}
              </Text>
              {showRatings && item.rating ? (
                <StarRating value={item.rating} testID={`recipe-rating-${item.id}`} size={16} />
              ) : null}
              <Text style={styles.meta}>
                {item.servings} servings
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
      {selecting && pdf.available ? (
        <Pressable
          style={[styles.fab, { bottom: 24 + bottomInset }, (picked.size === 0 || pdf.busy) && styles.fabDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: picked.size === 0 || pdf.busy }}
          disabled={picked.size === 0 || pdf.busy}
          onPress={() => void sharePicked(recipes)}
          testID="pdf-share-button">
          {pdf.busy ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={styles.fabText}>Share PDF{picked.size > 0 ? ` (${picked.size})` : ''}</Text>
          )}
        </Pressable>
      ) : (
        <Link href="/add" asChild>
          <Pressable
            style={StyleSheet.flatten([styles.fab, { bottom: 24 + bottomInset }])}
            accessibilityRole="button"
            testID="list-add-recipe-button">
            <Text style={styles.fabText}>+ Add recipe</Text>
          </Pressable>
        </Link>
      )}
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

const useStyles = makeStyles((colors) => ({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  importLink: { marginHorizontal: 12, marginTop: 10, minHeight: 44, justifyContent: 'center' },
  importLinkText: { color: colors.primary, fontWeight: '700', fontSize: 16 },
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
  fabDisabled: { opacity: 0.5 },
  selectBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 8 },
  selectHint: { flex: 1, color: colors.muted },
  selectAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  selectActionText: { color: colors.primary, fontWeight: '700' },
  pdfError: { color: colors.danger, marginHorizontal: 12, marginTop: 8 },
}));
