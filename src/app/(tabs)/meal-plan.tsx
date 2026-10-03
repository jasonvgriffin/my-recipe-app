import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fromIsoDate, startOfWeek, toIsoDate, weekDates } from '@/lib/dates';
import { colors } from '@/lib/theme';
import { mealPlanStore } from '@/storage/meal-plan';
import { recipeStore } from '@/storage/recipes';
import type { MealPlanEntry } from '@/types/meal-plan';
import type { Recipe } from '@/types/recipe';

/**
 * Meal plan tab (spec #11) — week view scaffold.
 * TODO(spec #11): month calendar view, add/link recipes to a day (recipe picker), move/remove entries.
 * Recipes can already be planned from the recipe detail screen ("Plan for today").
 */
export default function MealPlanScreen() {
  const [weekStart, setWeekStart] = useState(() => toIsoDate(startOfWeek(new Date())));
  const days = useMemo(() => weekDates(weekStart), [weekStart]);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [recipes, setRecipes] = useState<Map<string, Recipe>>(new Map());

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [e, r] = await Promise.all([mealPlanStore.entriesForDates(days), recipeStore.list()]);
        if (!active) return;
        setEntries(e);
        setRecipes(new Map(r.map((x) => [x.id, x])));
      })();
      return () => {
        active = false;
      };
    }, [days]),
  );

  function shiftWeek(delta: number) {
    const d = fromIsoDate(weekStart);
    d.setDate(d.getDate() + 7 * delta);
    setWeekStart(toIsoDate(d));
  }

  const today = toIsoDate(new Date());

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.weekNav}>
        <Pressable onPress={() => shiftWeek(-1)} hitSlop={12}>
          <Text style={styles.navText}>‹ Prev</Text>
        </Pressable>
        <Text style={styles.weekLabel}>Week of {fromIsoDate(weekStart).toLocaleDateString()}</Text>
        <Pressable onPress={() => shiftWeek(1)} hitSlop={12}>
          <Text style={styles.navText}>Next ›</Text>
        </Pressable>
      </View>
      {days.map((day) => {
        const dayEntries = entries.filter((e) => e.date === day);
        return (
          <View key={day} style={[styles.day, day === today && styles.today]}>
            <Text style={styles.dayLabel}>
              {fromIsoDate(day).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            </Text>
            {dayEntries.length === 0 ? (
              <Text style={styles.empty}>Nothing planned</Text>
            ) : (
              dayEntries.map((e) => {
                const r = recipes.get(e.recipeId);
                return r ? (
                  <Link key={e.id} href={{ pathname: '/recipe/[id]', params: { id: r.id } }} style={styles.entry}>
                    {e.slot ? `${e.slot}: ` : ''}
                    {r.title}
                  </Link>
                ) : null;
              })
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, gap: 8, paddingBottom: 32 },
  weekNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  navText: { color: colors.primary, fontWeight: '600', fontSize: 16 },
  weekLabel: { color: colors.text, fontWeight: '600' },
  day: { backgroundColor: colors.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
  today: { borderColor: colors.primary },
  dayLabel: { color: colors.text, fontWeight: '700', marginBottom: 4 },
  empty: { color: colors.muted },
  entry: { color: colors.primary, fontSize: 16, paddingVertical: 2 },
});
