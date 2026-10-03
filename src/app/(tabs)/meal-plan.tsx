import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { DayPlan } from '@/components/day-plan';
import { MaxWidthContainer, MAX_CONTENT_WIDTH, TwoPaneLayout } from '@/components/layout';
import { MealCalendar } from '@/components/meal-calendar';
import { OptionalFeature } from '@/components/optional-feature';
import { ensureRecipesSeeded } from '@/data/ensure-seed';
import { useOnDataChange } from '@/hooks/use-on-data-change';
import { useWindowSizeClass } from '@/hooks/use-window-size-class';
import {
  addDays,
  addMonths,
  formatMonthYear,
  formatShortDate,
  fromIsoDate,
  inMonth,
  monthGrid,
  startOfWeek,
  toIsoDate,
  weekDates,
} from '@/lib/dates';
import { mealPlanStore } from '@/storage/meal-plan';
import { recipeStore } from '@/storage/recipes';
import type { IsoDate, MealPlanEntry } from '@/types/meal-plan';
import type { Recipe } from '@/types/recipe';

type CalendarMode = 'week' | 'month';

/**
 * Meal plan tab (spec #11, #23). Calendar stays mounted across fold/unfold; the selected day is parent state.
 * Compact opens the day on its own route. Medium/expanded shows that day beside the calendar.
 */
export default function MealPlanScreen() {
  return (
    <OptionalFeature id="mealPlan" hiddenLabel="Meal plan is hidden.">
      <MealPlanBody />
    </OptionalFeature>
  );
}

function MealPlanBody() {
  const { isTwoPane } = useWindowSizeClass();
  const [mode, setMode] = useState<CalendarMode>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState<IsoDate>(() => toIsoDate(new Date()));
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [recipes, setRecipes] = useState<Map<string, Recipe>>(new Map());

  const today = toIsoDate(new Date());
  const dates = useMemo(() => {
    if (mode === 'week') return weekDates(toIsoDate(startOfWeek(anchor)));
    return monthGrid(anchor.getFullYear(), anchor.getMonth());
  }, [mode, anchor]);

  const label =
    mode === 'week'
      ? `Week of ${formatShortDate(toIsoDate(startOfWeek(anchor)))}`
      : formatMonthYear(anchor.getFullYear(), anchor.getMonth());

  const load = useCallback(async () => {
    await ensureRecipesSeeded();
    const [nextEntries, list] = await Promise.all([mealPlanStore.entriesForDates(dates), recipeStore.list()]);
    setEntries(nextEntries);
    setRecipes(new Map(list.map((recipe) => [recipe.id, recipe])));
  }, [dates]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load().catch(() => {
        if (!active) return;
      });
      return () => {
        active = false;
      };
    }, [load]),
  );
  useOnDataChange(() => {
    void load();
  });

  const entriesByDate = useMemo(() => {
    const map = new Map<IsoDate, MealPlanEntry[]>();
    for (const entry of entries) {
      const bucket = map.get(entry.date) ?? [];
      bucket.push(entry);
      map.set(entry.date, bucket);
    }
    return map;
  }, [entries]);

  function selectDay(date: IsoDate) {
    setSelected(date);
    if (!isTwoPane) router.push({ pathname: '/meal-plan/[date]', params: { date } });
  }

  const monthFilter =
    mode === 'month' ? (iso: IsoDate) => inMonth(iso, anchor.getFullYear(), anchor.getMonth()) : undefined;

  const calendar = (
    <MealCalendar
      mode={mode}
      label={label}
      dates={dates}
      today={today}
      selected={selected}
      inMonth={monthFilter}
      entriesByDate={entriesByDate}
      recipes={recipes}
      onMode={setMode}
      onPrev={() => setAnchor((d) => (mode === 'week' ? fromIsoDate(addDays(toIsoDate(d), -7)) : addMonths(d, -1)))}
      onNext={() => setAnchor((d) => (mode === 'week' ? fromIsoDate(addDays(toIsoDate(d), 7)) : addMonths(d, 1)))}
      onToday={() => {
        const now = new Date();
        setAnchor(now);
        setSelected(toIsoDate(now));
      }}
      onSelect={selectDay}
    />
  );

  return (
    <TwoPaneLayout
      testID="meal-plan-layout"
      primary={
        <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.text}>
          <ScrollView>{calendar}</ScrollView>
        </MaxWidthContainer>
      }
      secondary={
        <DayPlan key={selected} date={selected} onChanged={() => void load()} />
      }
      placeholder={<View />}
    />
  );
}
