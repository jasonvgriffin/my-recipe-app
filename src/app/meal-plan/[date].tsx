import { Stack, useLocalSearchParams } from 'expo-router';

import { DayPlan } from '@/components/day-plan';
import { MaxWidthContainer } from '@/components/layout';
import { OptionalFeature } from '@/components/optional-feature';
import { formatLongDate } from '@/lib/dates';
import type { IsoDate } from '@/types/meal-plan';

/** Compact meal-plan day (spec #11, #23). Expanded widths show this beside the calendar instead. */
export default function MealPlanDayScreen() {
  const params = useLocalSearchParams<{ date: string }>();
  const date = (Array.isArray(params.date) ? params.date[0] : params.date) as IsoDate;
  return (
    <OptionalFeature id="mealPlan" hiddenLabel="Meal plan is hidden.">
      <MaxWidthContainer>
        <Stack.Screen options={{ title: date ? formatLongDate(date) : 'Day' }} />
        {date ? <DayPlan date={date} /> : null}
      </MaxWidthContainer>
    </OptionalFeature>
  );
}
