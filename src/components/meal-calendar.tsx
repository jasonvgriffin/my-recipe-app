import { Pressable, StyleSheet, Text, View } from 'react-native';

import { WEEKDAY_LABELS, formatLongDate } from '@/lib/dates';
import { colors } from '@/lib/theme';
import type { IsoDate, MealPlanEntry } from '@/types/meal-plan';
import type { Recipe } from '@/types/recipe';

export interface MealCalendarProps {
  mode: 'week' | 'month';
  label: string;
  dates: IsoDate[];
  today: IsoDate;
  selected: IsoDate;
  inMonth?: (iso: IsoDate) => boolean;
  entriesByDate: Map<IsoDate, MealPlanEntry[]>;
  recipes: Map<string, Recipe>;
  onMode: (mode: 'week' | 'month') => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelect: (date: IsoDate) => void;
}

/** Week or month calendar (spec #11). Selecting a day is handled by the parent (pane vs route). */
export function MealCalendar({
  mode,
  label,
  dates,
  today,
  selected,
  inMonth,
  entriesByDate,
  recipes,
  onMode,
  onPrev,
  onNext,
  onToday,
  onSelect,
}: MealCalendarProps) {
  const prevLabel = mode === 'week' ? 'Previous week' : 'Previous month';
  const nextLabel = mode === 'week' ? 'Next week' : 'Next month';
  return (
    <View style={styles.wrap} testID="meal-calendar">
      <View style={styles.modes}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'week' }}
          onPress={() => onMode('week')}
          style={[styles.mode, mode === 'week' && styles.modeOn]}
          testID="view-week">
          <Text style={[styles.modeText, mode === 'week' && styles.modeTextOn]}>Week</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: mode === 'month' }}
          onPress={() => onMode('month')}
          style={[styles.mode, mode === 'month' && styles.modeOn]}
          testID="view-month">
          <Text style={[styles.modeText, mode === 'month' && styles.modeTextOn]}>Month</Text>
        </Pressable>
        <View style={styles.modeSpacer} />
        <Pressable accessibilityRole="button" onPress={onToday} style={styles.todayBtn} testID="jump-today">
          <Text style={styles.todayText}>Today</Text>
        </Pressable>
      </View>
      <View style={styles.nav}>
        <Pressable accessibilityRole="button" accessibilityLabel={prevLabel} onPress={onPrev} hitSlop={8} testID="cal-prev">
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.label} testID="calendar-label">
          {label}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel={nextLabel} onPress={onNext} hitSlop={8} testID="cal-next">
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
                mode === 'week' && styles.cellWeek,
                iso === selected && styles.cellSelected,
                iso === today && styles.cellToday,
              ]}
              testID={`day-${iso}`}>
              <Text style={[styles.dayNum, outside && styles.outside]}>{Number(iso.slice(8))}</Text>
              {mode === 'week' ? (
                titles.length === 0 ? (
                  <Text style={styles.none}>—</Text>
                ) : (
                  <>
                    {titles.slice(0, 2).map((title) => (
                      <Text key={title} numberOfLines={2} style={styles.entry}>
                        {title}
                      </Text>
                    ))}
                    {titles.length > 2 ? <Text style={styles.more}>+{titles.length - 2}</Text> : null}
                  </>
                )
              ) : dayEntries.length > 0 ? (
                <Text style={[styles.count, outside && styles.outside]}>{dayEntries.length}</Text>
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
  mode: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeText: { color: colors.muted, fontWeight: '600' },
  modeTextOn: { color: colors.primaryText },
  modeSpacer: { flex: 1 },
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
    minHeight: 48,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  cellWeek: { minHeight: 88 },
  cellSelected: { borderColor: colors.primary },
  cellToday: { backgroundColor: colors.tagBg },
  dayNum: { color: colors.text, fontWeight: '700', fontSize: 13 },
  outside: { color: colors.placeholder },
  none: { color: colors.placeholder, fontSize: 12 },
  entry: { color: colors.text, fontSize: 11, marginTop: 2 },
  more: { color: colors.muted, fontSize: 11 },
  count: { color: colors.primary, fontWeight: '700', fontSize: 12, marginTop: 2 },
});
