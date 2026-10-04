import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MaxWidthContainer, MAX_CONTENT_WIDTH, TwoPaneLayout } from '@/components/layout';
import { OptionalFeature } from '@/components/optional-feature';
import { PantryOnHand } from '@/components/pantry-on-hand';
import { ShoppingListView, type ShoppingItemEdit } from '@/components/shopping-list-view';
import { useFeatureVisible } from '@/hooks/use-feature';
import { useOnDataChange } from '@/hooks/use-on-data-change';
import { addDays, startOfWeek, toIsoDate, weekDates } from '@/lib/dates';
import {
  addManualItem,
  clearChecked,
  collectIngredientKeys,
  compileWeekShoppingList,
  emptyShoppingList,
  toggleItem,
  updateItemDetails,
} from '@/lib/shopping';
import { pantryMatcher } from '@/pantry';
import { mealPlanStore } from '@/storage/meal-plan';
import { recipeStore } from '@/storage/recipes';
import type { IsoDate, ShoppingList } from '@/types/meal-plan';

/**
 * Shopping list (spec #12, #23). Compiled from a chosen week, with manual lines and check-off.
 * Expanded width shows what is already on hand beside the list. Pantry skip goes through `pantryMatcher`
 * (`isInPantry` rules; off when the pantry is locked or hidden).
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
  const showPantry = useFeatureVisible('pantry');
  const showScan = useFeatureVisible('barcodeScan');
  const { added } = useLocalSearchParams<{ added?: string }>();
  const [weekStart, setWeekStart] = useState<IsoDate>(() => toIsoDate(startOfWeek(new Date())));
  const [list, setList] = useState<ShoppingList | undefined>();
  const [mealCount, setMealCount] = useState(0);
  const [manualText, setManualText] = useState('');
  const [manualQuantity, setManualQuantity] = useState('');
  const [manualNotes, setManualNotes] = useState('');

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
  useOnDataChange(() => {
    void load().catch(() => undefined);
  });

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
    const next = addManualItem(base, manualText, new Date(), { quantity: manualQuantity, notes: manualNotes });
    if (next === base) return;
    setManualText('');
    setManualQuantity('');
    setManualNotes('');
    await persist(next);
  }

  async function editItem(id: string, edit: ShoppingItemEdit) {
    if (!list) return;
    await persist(updateItemDetails(list, id, edit));
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
      manualQuantity={manualQuantity}
      onManualQuantity={setManualQuantity}
      manualNotes={manualNotes}
      onManualNotes={setManualNotes}
      onEditItem={editItem}
      showGroceryRun={showGrocery}
      onPrevWeek={() => setWeekStart((w) => addDays(w, -7))}
      onNextWeek={() => setWeekStart((w) => addDays(w, 7))}
      onBuild={build}
      onToggle={toggle}
      onAddManual={addManual}
      onClearChecked={clearDone}
      onGroceryRun={() => router.push({ pathname: '/grocery-run', params: { weekStart } })}
      onScan={showScan ? () => router.push({ pathname: '/shopping/scan', params: { weekStart } }) : undefined}
      added={typeof added === 'string' && added ? added : undefined}
    />
  );

  const primary = <MaxWidthContainer maxWidth={MAX_CONTENT_WIDTH.list}>{listPane}</MaxWidthContainer>;

  if (!showPantry) {
    // No pantry pane at any width when the pantry is hidden — no empty pane, no prompt.
    return (
      <View style={styles.fill} testID="shopping-layout-single">
        {primary}
      </View>
    );
  }

  return (
    <TwoPaneLayout
      testID="shopping-layout"
      primary={primary}
      secondary={<PantryOnHand />}
      placeholder={<View />}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
