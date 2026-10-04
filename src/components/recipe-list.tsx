import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { AdvancedSearchSheet } from '@/components/advanced-search-sheet';
import { MaxWidthContainer, MAX_CONTENT_WIDTH, TwoPaneLayout, useBottomInset } from '@/components/layout';
import { RecipeCategories } from '@/components/recipe-categories';
import { RecipeDetail } from '@/components/recipe-detail';
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
  groupRecipesByCategory,
  isAdvancedSearchActive,
  isBrowseFiltered,
  resetAdvancedSearch,
  sortRecipes,
  type RecipeBrowse,
} from '@/lib/recipe-utils';
import { makeStyles, useColors } from '@/hooks/use-theme';
import { recipeStore } from '@/storage/recipes';
import type { Category, Recipe } from '@/types/recipe';

/**
 * The recipe list (spec #8, #9, #23): search row at the top, then the recipes, and (medium/expanded) the detail beside it.
 * v1.0.5: the page shows only the search row (box + “Advanced search” filter button, with a dot when any filter or
 * sort is non-default) and the recipe CATEGORIES (`RecipeCategories`: collapsible Breakfast / Lunch / Dinner / …,
 * Uncategorized when non-empty). Typing a search or setting a filter shows the flat list of matching recipes as
 * before. The filters live in `AdvancedSearchSheet`. No “Import from link” / “Select recipes for PDF” links any more
 * (both stay in the + menu). With categories locked by the gate the page is the flat list (core recipes never gated).
 * v1.0.4: this IS the Recipes tab (`(tabs)/index.tsx`; the old five-link Recipes home page is gone). The stack
 * route `recipes.tsx` renders it too for deep links: `?focus=search` (+ menu “Search Recipes”) focuses the box and
 * `?select=pdf` (+ menu “Share Recipes”) opens straight into PDF-pick mode — pick, then “Share PDF” opens the share sheet.
 * v1.0.3: “Select” picks several recipes for one PDF (`usePdfExport`).
 */
export function RecipeList() {
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
    if (showCategories) await recipeStore.prepareCategories();
    const [list, cats, tags] = await Promise.all([
      recipeStore.list(),
      recipeStore.listCategories(),
      recipeStore.listTags(),
    ]);
    applyCatalog(list, cats, tags);
  }, [applyCatalog, showCategories]);
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

  async function printPicked(all: Recipe[]) {
    const chosen = all.filter((r) => picked.has(r.id));
    if (chosen.length === 0) return;
    await pdf.printPdf(chosen);
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
        if (showCategories) await recipeStore.prepareCategories();
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
    }, [applyCatalog, showCategories]),
  );

  function changeBrowse(next: RecipeBrowse) {
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
    // v1.0.5: categories are the page's grouping, not a filter.
    categoryId: undefined,
    tags: showTags ? browse.tags.filter((t) => tagNames.includes(t)) : [],
    minRating: showRatings ? browse.minRating : undefined,
    sort: effectiveRecipeSort(browse.sort, showRatings),
  };
  const advancedActive = isAdvancedSearchActive(filteredBrowse);
  const visible = sortRecipes(
    filterRecipes(
      recipes,
      browseFilters(filteredBrowse, {
        categories: false,
        tags: showTags,
        ratings: showRatings,
      }),
    ),
    filteredBrowse.sort,
  );
  const searching = isBrowseFiltered(filteredBrowse);
  /** Browse by category unless searching/filtering, picking for a PDF, or categories are locked. */
  const byCategory = showCategories && !searching && !selecting;
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name;
  const listBottom = 24 + bottomInset + (selecting ? 72 : 0);

  const addRecipeButton = selecting ? null : (
    <Link href="/add" asChild>
      <Pressable style={styles.addRecipe} accessibilityRole="button" testID="list-add-recipe-button">
        <Ionicons name="add" size={20} color={colors.primaryText} />
        <Text style={styles.addRecipeText}>Add recipe</Text>
      </Pressable>
    </Link>
  );

  const searchRow = (
    <View style={styles.searchRow}>
      <TextInput
        style={styles.search}
        placeholder="Search recipes"
        value={browse.keyword}
        onChangeText={(keyword) => setBrowse((b) => ({ ...b, keyword }))}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.placeholder}
        accessibilityLabel="Search recipes"
        autoFocus={focus === 'search'}
        returnKeyType="search"
        testID="search-input"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={advancedActive ? 'Advanced search, filters on' : 'Advanced search'}
        onPress={() => setAdvancedOpen(true)}
        style={[styles.filterBtn, advancedActive && styles.filterBtnActive]}
        testID="advanced-search-button">
        <Ionicons name="options-outline" size={22} color={advancedActive ? colors.primaryText : colors.primary} />
        {advancedActive ? <View style={styles.filterDot} testID="advanced-search-indicator" /> : null}
      </Pressable>
    </View>
  );

  const list = (
    <View style={styles.container}>
      {searchRow}
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
      {searching && !selecting && advancedActive ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setBrowse(resetAdvancedSearch)}
          style={styles.filtersOn}
          testID="filters-on-reset">
          <Text style={styles.filtersOnText}>Filters on · Reset</Text>
        </Pressable>
      ) : null}
      {byCategory ? (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: listBottom }]}
          keyboardShouldPersistTaps="handled"
          testID="recipe-category-scroll">
          <RecipeCategories
            {...groupRecipesByCategory(visible, categories)}
            showRatings={showRatings}
            selectedId={isTwoPane ? selectedId : null}
            onOpen={openRecipe}
            onChanged={() => void reload()}
            accessory={addRecipeButton}
          />
          {recipes.length === 0 ? (
            <Text style={styles.hint}>No recipes yet. Tap “Add recipe” or the + button to create or import one.</Text>
          ) : null}
        </ScrollView>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(r) => r.id}
          extraData={[selectedId, selecting, picked]}
          contentContainerStyle={[styles.list, { paddingBottom: listBottom }]}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.empty}>
              {searching ? 'No recipes match.' : 'No recipes yet. Tap “Add recipe” or the + button to create or import one.'}
            </Text>
          }
          ListFooterComponent={searching ? null : addRecipeButton}
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
      )}
      {selecting && pdf.available ? (
        <View style={[styles.fabRow, { bottom: 24 + bottomInset }]}>
          <Pressable
            style={[styles.fab, styles.fabSecondary, (picked.size === 0 || pdf.busy) && styles.fabDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Print"
            accessibilityState={{ disabled: picked.size === 0 || pdf.busy }}
            disabled={picked.size === 0 || pdf.busy}
            onPress={() => void printPicked(recipes)}
            testID="pdf-print-button">
            <Ionicons name="print-outline" size={20} color={colors.primary} />
            <Text style={styles.fabSecondaryText}>Print</Text>
          </Pressable>
          <Pressable
            style={[styles.fab, (picked.size === 0 || pdf.busy) && styles.fabDisabled]}
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
        </View>
      ) : null}
      <AdvancedSearchSheet
        visible={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
        browse={filteredBrowse}
        onChange={changeBrowse}
        onReset={() => setBrowse(resetAdvancedSearch)}
        active={advancedActive}
        tagNames={tagNames}
        showTags={showTags}
        showRatings={showRatings}
      />
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
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, marginBottom: 0 },
  search: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    color: colors.text,
  },
  filterBtn: {
    width: 48,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: { backgroundColor: colors.primary },
  filterDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.card,
  },
  filtersOn: { marginHorizontal: 12, marginTop: 8, minHeight: 32, justifyContent: 'center' },
  filtersOnText: { color: colors.primary, fontWeight: '600' },
  list: { padding: 12, gap: 10 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
  hint: { textAlign: 'center', color: colors.muted, marginTop: 8 },
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
  addRecipe: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    minHeight: 48,
    borderRadius: 24,
  },
  addRecipeText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  fabRow: { position: 'absolute', right: 16, bottom: 24, flexDirection: 'row', gap: 10 },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    minHeight: 48,
    justifyContent: 'center',
    borderRadius: 28,
    elevation: 4,
  },
  fabText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
  fabSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary },
  fabSecondaryText: { color: colors.primary, fontWeight: '700', fontSize: 16 },
  fabDisabled: { opacity: 0.5 },
  selectBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 8 },
  selectHint: { flex: 1, color: colors.muted },
  selectAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  selectActionText: { color: colors.primary, fontWeight: '700' },
  pdfError: { color: colors.danger, marginHorizontal: 12, marginTop: 8 },
}));
