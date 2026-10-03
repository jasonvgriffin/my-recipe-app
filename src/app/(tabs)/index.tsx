import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { filterRecipes, type RecipeFilter } from '@/lib/recipe-utils';
import { colors } from '@/lib/theme';
import { recipeStore } from '@/storage/recipes';
import { isLowCarb, type Recipe } from '@/types/recipe';

/** List filters (spec #9). TODO: category filter chips (spec #3). */
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
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<FilterMode>('all');

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

  return (
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
          <Link href={{ pathname: '/recipe/[id]', params: { id: item.id } }} asChild>
            <Pressable style={styles.card}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.meta}>
                {item.carbsPerServing ?? '?'} g carbs/serving · {item.servings} servings
                {isLowCarb(item) ? ' · low-carb' : ''}
                {item.cooked ? ' · cooked' : ''}
              </Text>
              {item.tags.length > 0 && <Text style={styles.tags}>{item.tags.map((t) => `#${t}`).join('  ')}</Text>}
            </Pressable>
          </Link>
        )}
      />
      <Link href="/add" asChild>
        <Pressable style={styles.fab} accessibilityRole="button" testID="add-recipe-button">
          <Text style={styles.fabText}>+ Add recipe</Text>
        </Pressable>
      </Link>
    </View>
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
