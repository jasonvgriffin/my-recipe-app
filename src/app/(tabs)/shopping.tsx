import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { MaxWidthContainer, MAX_CONTENT_WIDTH } from '@/components/layout';
import { startOfWeek, toIsoDate, weekDates } from '@/lib/dates';
import { buildShoppingList, toggleItem } from '@/lib/shopping';
import { colors } from '@/lib/theme';
import { mealPlanStore } from '@/storage/meal-plan';
import { recipeStore } from '@/storage/recipes';
import type { ShoppingList } from '@/types/meal-plan';

/**
 * Shopping list tab (spec #12): compiled from this week's meal plan, with check-off.
 * TODO(spec #23): medium/expanded → TwoPaneLayout (shopping list + pantry, spec #21).
 * TODO(spec #12): pick which week, merge quantities, add manual items, clear checked.
 */
export default function ShoppingScreen() {
  const weekStart = toIsoDate(startOfWeek(new Date()));
  const [list, setList] = useState<ShoppingList | undefined>();

  useFocusEffect(
    useCallback(() => {
      mealPlanStore.getShoppingList(weekStart).then(setList);
    }, [weekStart]),
  );

  async function compile() {
    const days = weekDates(weekStart);
    const [entries, recipes] = await Promise.all([mealPlanStore.entriesForDates(days), recipeStore.list()]);
    const next = buildShoppingList(weekStart, days, entries, recipes);
    await mealPlanStore.saveShoppingList(next);
    setList(next);
  }

  async function toggle(id: string) {
    if (!list) return;
    const next = toggleItem(list, id);
    setList(next);
    await mealPlanStore.saveShoppingList(next);
  }

  return (
    <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.list}>
      <View style={styles.container}>
        <Pressable style={styles.button} onPress={compile}>
          <Text style={styles.buttonText}>
            {list ? 'Rebuild from this week’s plan' : 'Build from this week’s plan'}
          </Text>
        </Pressable>
        <FlatList
          data={list?.items ?? []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {list ? 'No ingredients — plan some recipes for this week first.' : 'No list yet for this week.'}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.item} onPress={() => toggle(item.id)}>
              <Text style={styles.check}>{item.checked ? '☑' : '☐'}</Text>
              <Text style={[styles.itemText, item.checked && styles.checked]}>{item.text}</Text>
            </Pressable>
          )}
        />
      </View>
    </MaxWidthContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  button: { backgroundColor: colors.primary, padding: 12, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: colors.primaryText, fontWeight: '700' },
  list: { paddingVertical: 12, gap: 6 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 32 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  check: { color: colors.primary, fontSize: 20 },
  itemText: { color: colors.text, fontSize: 16, flex: 1 },
  checked: { color: colors.muted, textDecorationLine: 'line-through' },
});
