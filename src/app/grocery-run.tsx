import { useKeepAwake } from 'expo-keep-awake';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { GroceryAisleSummary, GroceryRunView } from '@/components/grocery-run-view';
import { TwoPaneLayout } from '@/components/layout';
import { OptionalFeature } from '@/components/optional-feature';
import { startOfWeek, toIsoDate, weekDates } from '@/lib/dates';
import { ingredientKey } from '@/lib/ingredients';
import {
  collectIngredientKeys,
  compileRecipeShoppingList,
  compileWeekShoppingList,
  setItemChecked,
  shoppingProgress,
} from '@/lib/shopping';
import { colors } from '@/lib/theme';
import { pantryMatcher } from '@/pantry';
import { mealPlanStore } from '@/storage/meal-plan';
import { recipeStore } from '@/storage/recipes';
import type { ShoppingList, ShoppingListItem } from '@/types/meal-plan';

function param(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first || undefined;
}

/**
 * Grocery run (spec #18). Full-screen checklist for one recipe or a planned week.
 * Grouped by aisle, large targets, progress, undo. The screen stays awake while this is open.
 */
export default function GroceryRunScreen() {
  return (
    <OptionalFeature id="groceryRun" hiddenLabel="Grocery run is hidden.">
      <GroceryRunBody />
    </OptionalFeature>
  );
}

function GroceryRunBody() {
  useKeepAwake('grocery-run', { suppressDeactivateWarnings: true });
  const params = useLocalSearchParams<{ weekStart?: string; recipeId?: string }>();
  const recipeId = param(params.recipeId);
  const weekStart = param(params.weekStart) ?? (recipeId ? undefined : toIsoDate(startOfWeek(new Date())));
  const [list, setList] = useState<ShoppingList | undefined>();
  const [missing, setMissing] = useState(false);
  const [ready, setReady] = useState(false);
  const [undoStack, setUndoStack] = useState<{ id: string; checked: boolean }[]>([]);

  const load = useCallback(async () => {
    if (recipeId) {
      const recipe = await recipeStore.get(recipeId);
      if (!recipe) {
        setMissing(true);
        setList(undefined);
        setReady(true);
        return;
      }
      const keys = recipe.ingredients.map((ing) => ingredientKey(ing)).filter(Boolean);
      const skip = await pantryMatcher.skipKeys(keys);
      const storedKey = `recipe:${recipe.id}`;
      const previous = await mealPlanStore.getShoppingList(storedKey);
      const next = compileRecipeShoppingList(recipe, previous, (key) => skip.has(key));
      await mealPlanStore.saveShoppingList(next);
      setList(next);
      setMissing(false);
      setReady(true);
      return;
    }
    const week = weekStart ?? toIsoDate(startOfWeek(new Date()));
    const days = weekDates(week);
    const [entries, recipes] = await Promise.all([mealPlanStore.entriesForDates(days), recipeStore.list()]);
    const skip = await pantryMatcher.skipKeys(collectIngredientKeys(entries, recipes, days));
    const previous = await mealPlanStore.getShoppingList(week);
    const next = compileWeekShoppingList(week, entries, recipes, previous, (key) => skip.has(key));
    await mealPlanStore.saveShoppingList(next);
    setList(next);
    setMissing(false);
    setReady(true);
  }, [recipeId, weekStart]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load()
        .then(() => {
          if (!active) return;
        })
        .catch(() => {
          if (active) setReady(true);
        });
      return () => {
        active = false;
      };
    }, [load]),
  );

  async function toggle(item: ShoppingListItem) {
    if (!list) return;
    setUndoStack((stack) => [...stack, { id: item.id, checked: item.checked }]);
    const next = setItemChecked(list, item.id, !item.checked);
    setList(next);
    await mealPlanStore.saveShoppingList(next);
  }

  async function undo() {
    const last = undoStack[undoStack.length - 1];
    if (!last || !list) return;
    setUndoStack((stack) => stack.slice(0, -1));
    const next = setItemChecked(list, last.id, last.checked);
    setList(next);
    await mealPlanStore.saveShoppingList(next);
  }

  const items = list?.items ?? [];
  const progress = shoppingProgress(items);
  const title =
    recipeId != null ? 'Grocery run' : progress.total > 0 ? `Grocery run · ${progress.checked}/${progress.total}` : 'Grocery run';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title }} />
      {!ready ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : missing ? (
        <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 48 }}>Recipe not found.</Text>
      ) : (
        <TwoPaneLayout
          testID="grocery-layout"
          primary={<GroceryRunView items={items} canUndo={undoStack.length > 0} onToggle={toggle} onUndo={undo} />}
          secondary={<GroceryAisleSummary items={items} />}
        />
      )}
    </View>
  );
}
