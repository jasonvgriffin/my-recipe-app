import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { DayPlan } from '@/components/day-plan';
import { MaxWidthContainer, MAX_CONTENT_WIDTH, TwoPaneLayout, useBottomInset } from '@/components/layout';
import { MealCalendar } from '@/components/meal-calendar';
import { OptionalFeature } from '@/components/optional-feature';
import { useOnDataChange } from '@/hooks/use-on-data-change';
import { useWindowSizeClass } from '@/hooks/use-window-size-class';
import { addMonths, formatMonthYear, inMonth, monthGrid, toIsoDate } from '@/lib/dates';
import { mealPlanStore } from '@/storage/meal-plan';
import { recipeStore } from '@/storage/recipes';
import type { IsoDate, MealPlanEntry } from '@/types/meal-plan';
import type { Recipe } from '@/types/recipe';

/**
 * Meal plan tab (spec #11, #23). Month view only (v1.0.1: the week view was removed). Calendar stays mounted across fold/unfold; the selected day is parent state.
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
  const bottomInset = useBottomInset();
  const { isTwoPane } = useWindowSizeClass();
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState<IsoDate>(() => toIsoDate(new Date()));
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [recipes, setRecipes] = useState<Map<string, Recipe>>(new Map());

  const today = toIsoDate(new Date());
  const dates = useMemo(() => monthGrid(anchor.getFullYear(), anchor.getMonth()), [anchor]);
  const label = formatMonthYear(anchor.getFullYear(), anchor.getMonth());

  const load = useCallback(async () => {
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

  const monthFilter = (iso: IsoDate) => inMonth(iso, anchor.getFullYear(), anchor.getMonth());

  const calendar = (
    <MealCalendar
      label={label}
      dates={dates}
      today={today}
      selected={selected}
      inMonth={monthFilter}
      entriesByDate={entriesByDate}
      recipes={recipes}
      onPrev={() => setAnchor((d) => addMonths(d, -1))}
      onNext={() => setAnchor((d) => addMonths(d, 1))}
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
          <ScrollView contentContainerStyle={{ paddingBottom: bottomInset }}>{calendar}</ScrollView>
        </MaxWidthContainer>
      }
      secondary={
        <DayPlan key={selected} date={selected} onChanged={() => void load()} />
      }
      placeholder={<View />}
    />
  );
}
