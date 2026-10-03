import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MaxWidthContainer, MAX_CONTENT_WIDTH, TwoPaneLayout } from '@/components/layout';
import { RecipeDetail } from '@/components/recipe-detail';
import { useFeature } from '@/hooks/use-feature';
import { useOnDataChange } from '@/hooks/use-on-data-change';
import { useWindowSizeClass } from '@/hooks/use-window-size-class';
import { filterRecipes, type RecipeFilter } from '@/lib/recipe-utils';
import { colors } from '@/lib/theme';
import { recipeStore } from '@/storage/recipes';
import { isLowCarb, netCarbs, type Recipe } from '@/types/recipe';

/** List filters (spec #9). TODO: category (#3), tag (#20), rating filter + sort (#22) controls — helpers exist. */
type FilterMode = 'all' | 'cooked' | 'recent' | 'notCooked';
const FILTERS: Record<FilterMode, Omit<RecipeFilter, 'keyword'>> = {
  all: {},
  cooked: { cooked: true },
  recent: { cookedWithinDays: 14 },
  notCooked: { cooked: false },
};
const FILTER_LABELS: Record<FilterMode, string> = {
  all: 'All',
  cooked: 'Cooked',
  recent: 'Cooked recently',
  notCooked: 'Not cooked yet',
};

export default function RecipeListScreen() {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const showRatings = useFeature('ratings').available;
  const showTags = useFeature('tags').available;
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<FilterMode>('all');
  /** Selected recipe for the detail pane (medium/expanded). Kept across fold/unfold. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { isTwoPane } = useWindowSizeClass();

  const reload = useCallback(async () => setRecipes(await recipeStore.list()), []);
  useOnDataChange(() => {
    void reload();
  });

  function openRecipe(id: string) {
    if (isTwoPane) setSelectedId(id);
    else router.push({ pathname: '/recipe/[id]', params: { id } });
  }

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        await recipeStore.seedIfNeeded();
        const list = await recipeStore.list();
        if (active) setRecipes(list);
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  if (!recipes) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const visible = filterRecipes(recipes, { keyword: query, ...FILTERS[mode] });

  const list = (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search title, tag or ingredient"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        placeholderTextColor={colors.placeholder}
        testID="search-input"
      />
      <View style={styles.chips}>
        {(Object.keys(FILTERS) as FilterMode[]).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.chip, mode === m && styles.chipActive]}>
            <Text style={[styles.chipText, mode === m && styles.chipTextActive]}>{FILTER_LABELS[m]}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={visible}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No recipes yet. Tap “Add recipe” to create one.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.card, isTwoPane && item.id === selectedId && styles.cardSelected]}
            onPress={() => openRecipe(item.id)}
            testID={`recipe-item-${item.id}`}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.meta}>
              {netCarbs(item.nutrition) ?? '?'} g net carbs/serving · {item.servings} servings
              {isLowCarb(item) ? ' · low-carb' : ''}
              {item.cooked ? ' · cooked' : ''}
              {showRatings && item.rating ? ` · ${'★'.repeat(item.rating)}` : ''}
            </Text>
            {showTags && item.tags.length > 0 && (
              <Text style={styles.tags}>{item.tags.map((t) => `#${t}`).join('  ')}</Text>
            )}
          </Pressable>
        )}
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
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.input,
    color: colors.text,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginHorizontal: 12, marginTop: 10 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 13 },
  chipTextActive: { color: colors.primaryText, fontWeight: '600' },
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
    paddingVertical: 14,
    borderRadius: 28,
    elevation: 4,
  },
  fabText: { color: colors.primaryText, fontWeight: '700', fontSize: 16 },
});
