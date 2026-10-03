import { Pressable, StyleSheet, Text, View } from 'react-native';

import { WEEKDAY_LABELS, formatLongDate } from '@/lib/dates';
import { colors } from '@/lib/theme';
import type { IsoDate, MealPlanEntry } from '@/types/meal-plan';
import type { Recipe } from '@/types/recipe';

export interface MealCalendarProps {
  label: string;
  dates: IsoDate[];
  today: IsoDate;
  selected: IsoDate;
  inMonth?: (iso: IsoDate) => boolean;
  entriesByDate: Map<IsoDate, MealPlanEntry[]>;
  recipes: Map<string, Recipe>;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelect: (date: IsoDate) => void;
}

/** Month calendar (spec #11; month view only since v1.0.1). Selecting a day is handled by the parent (pane vs route). */
export function MealCalendar({
  label,
  dates,
  today,
  selected,
  inMonth,
  entriesByDate,
  recipes,
  onPrev,
  onNext,
  onToday,
  onSelect,
}: MealCalendarProps) {
  return (
    <View style={styles.wrap} testID="meal-calendar">
      <View style={styles.modes}>
        <Text style={styles.hint} numberOfLines={2} testID="meal-calendar-hint">
          Tap a day to add meal plan
        </Text>
        <Pressable accessibilityRole="button" onPress={onToday} style={styles.todayBtn} testID="jump-today">
          <Text style={styles.todayText}>Today</Text>
        </Pressable>
      </View>
      <View style={styles.nav}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={onPrev} hitSlop={8} testID="cal-prev">
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.label} testID="calendar-label">
          {label}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={onNext} hitSlop={8} testID="cal-next">
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.weekdays}>
        {WEEKDAY_LABELS.map((d) => (
          <Text key={d} style={styles.weekday}>
            {d}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {dates.map((iso) => {
          const dayEntries = entriesByDate.get(iso) ?? [];
          const outside = inMonth ? !inMonth(iso) : false;
          const titles = dayEntries
            .map((e) => recipes.get(e.recipeId)?.title)
            .filter((t): t is string => Boolean(t));
          return (
            <Pressable
              key={iso}
              accessibilityRole="button"
              accessibilityLabel={`${formatLongDate(iso)}${dayEntries.length ? `, ${dayEntries.length} planned` : ''}`}
              accessibilityState={{ selected: iso === selected }}
              onPress={() => onSelect(iso)}
              style={[
                styles.cell,
                iso === selected && styles.cellSelected,
                iso === today && styles.cellToday,
              ]}
              testID={`day-${iso}`}>
              <Text style={[styles.dayNum, outside && styles.outside]}>{Number(iso.slice(8))}</Text>
              {titles.length > 0 ? (
                <Text numberOfLines={2} style={[styles.entry, outside && styles.outside]}>
                  {titles[0]}
                </Text>
              ) : null}
              {dayEntries.length > 1 ? (
                <Text style={[styles.count, outside && styles.outside]}>+{dayEntries.length - 1}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 12, paddingBottom: 8 },
  modes: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  hint: { flex: 1, color: colors.muted, fontSize: 13 },
  todayBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  todayText: { color: colors.primary, fontWeight: '700' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navText: { color: colors.primary, fontSize: 28, fontWeight: '600', minWidth: 44, textAlign: 'center' },
  label: { color: colors.text, fontWeight: '700', fontSize: 16 },
  weekdays: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', color: colors.muted, fontSize: 12, marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    minHeight: 56,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  cellSelected: { borderColor: colors.primary },
  cellToday: { backgroundColor: colors.tagBg },
  dayNum: { color: colors.text, fontWeight: '700', fontSize: 13 },
  outside: { color: colors.placeholder },
  entry: { color: colors.text, fontSize: 10, marginTop: 2 },
  count: { color: colors.primary, fontWeight: '700', fontSize: 12, marginTop: 2 },
});
