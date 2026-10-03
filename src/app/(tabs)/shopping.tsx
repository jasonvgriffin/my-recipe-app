import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { MaxWidthContainer, MAX_CONTENT_WIDTH, TwoPaneLayout } from '@/components/layout';
import { OptionalFeature } from '@/components/optional-feature';
import { PantryOnHand } from '@/components/pantry-on-hand';
import { ShoppingListView } from '@/components/shopping-list-view';
import { useFeatureVisible } from '@/hooks/use-feature';
import { addDays, startOfWeek, toIsoDate, weekDates } from '@/lib/dates';
import {
  addManualItem,
  clearChecked,
  collectIngredientKeys,
  compileWeekShoppingList,
  emptyShoppingList,
  toggleItem,
} from '@/lib/shopping';
import { pantryMatcher } from '@/pantry';
import { mealPlanStore } from '@/storage/meal-plan';
import { recipeStore } from '@/storage/recipes';
import type { IsoDate, ShoppingList } from '@/types/meal-plan';

/**
 * Shopping list (spec #12, #23). Compiled from a chosen week, with manual lines and check-off.
 * Expanded width shows what is already on hand beside the list. Pantry skip goes through `isInPantry`.
 */
export default function ShoppingScreen() {
  return (
    <OptionalFeature id="shoppingList" hiddenLabel="Shopping list is hidden.">
      <ShoppingBody />
    </OptionalFeature>
  );
}

function ShoppingBody() {
  const showGrocery = useFeatureVisible('groceryRun');
  const [weekStart, setWeekStart] = useState<IsoDate>(() => toIsoDate(startOfWeek(new Date())));
  const [list, setList] = useState<ShoppingList | undefined>();
  const [mealCount, setMealCount] = useState(0);
  const [manualText, setManualText] = useState('');

  const load = useCallback(async () => {
    const [stored, entries] = await Promise.all([
      mealPlanStore.getShoppingList(weekStart),
      mealPlanStore.entriesForDates(weekDates(weekStart)),
    ]);
    setList(stored);
    setMealCount(entries.length);
  }, [weekStart]);

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

  async function build() {
    const days = weekDates(weekStart);
    const [entries, recipes] = await Promise.all([mealPlanStore.entriesForDates(days), recipeStore.list()]);
    const skip = await pantryMatcher.skipKeys(collectIngredientKeys(entries, recipes, days));
    const previous = await mealPlanStore.getShoppingList(weekStart);
    const next = compileWeekShoppingList(weekStart, entries, recipes, previous, (key) => skip.has(key));
    await mealPlanStore.saveShoppingList(next);
    setList(next);
    setMealCount(entries.length);
  }

  async function persist(next: ShoppingList) {
    setList(next.items.length === 0 ? undefined : next);
    await mealPlanStore.saveShoppingList(next);
    if (next.items.length === 0) setList(undefined);
  }

  async function toggle(id: string) {
    if (!list) return;
    await persist(toggleItem(list, id));
  }

  async function addManual() {
    const base = list ?? emptyShoppingList(weekStart);
    const next = addManualItem(base, manualText);
    if (next === base) return;
    setManualText('');
    await persist(next);
  }

  async function clearDone() {
    if (!list) return;
    await persist(clearChecked(list));
  }

  const listPane = (
    <ShoppingListView
      weekStart={weekStart}
      mealCount={mealCount}
      list={list}
      manualText={manualText}
      onManualText={setManualText}
      showGroceryRun={showGrocery}
      onPrevWeek={() => setWeekStart((w) => addDays(w, -7))}
      onNextWeek={() => setWeekStart((w) => addDays(w, 7))}
      onBuild={build}
      onToggle={toggle}
      onAddManual={addManual}
      onClearChecked={clearDone}
      onGroceryRun={() => router.push({ pathname: '/grocery-run', params: { weekStart } })}
    />
  );

  return (
    <TwoPaneLayout
      testID="shopping-layout"
      primary={<MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.list}>{listPane}</MaxWidthContainer>}
      secondary={<PantryOnHand />}
      placeholder={<View />}
    />
  );
}
