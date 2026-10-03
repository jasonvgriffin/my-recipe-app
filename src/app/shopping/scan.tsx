import { router, useLocalSearchParams } from 'expo-router';

import { BarcodeScanner } from '@/components/barcode-scanner';
import { OptionalFeature } from '@/components/optional-feature';
import { useFeatureVisible } from '@/hooks/use-feature';
import { startOfWeek, toIsoDate } from '@/lib/dates';
import { addManualItem, emptyShoppingList } from '@/lib/shopping';
import { mealPlanStore } from '@/storage/meal-plan';
import type { IsoDate } from '@/types/meal-plan';

/**
 * Shopping-list barcode scan (v1.0.1): same scanner and name-only Open Food Facts lookup as the pantry.
 * Adds the product name as a manual line on the week being viewed, then returns to the shopping list.
 */
export default function ShoppingScanScreen() {
  const { weekStart: weekParam } = useLocalSearchParams<{ weekStart?: string }>();
  const visible = useFeatureVisible('barcodeScan');
  const weekStart: IsoDate =
    typeof weekParam === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
      ? weekParam
      : toIsoDate(startOfWeek(new Date()));
  return (
    <OptionalFeature id="shoppingList" hiddenLabel="Shopping list is hidden.">
      <BarcodeScanner
        visible={visible}
        hiddenLabel="Shopping list is hidden."
        onProduct={async (product) => {
          const base = (await mealPlanStore.getShoppingList(weekStart)) ?? emptyShoppingList(weekStart);
          await mealPlanStore.saveShoppingList(addManualItem(base, product.name));
          router.navigate({ pathname: '/shopping', params: { added: product.name } });
        }}
      />
    </OptionalFeature>
  );
}
