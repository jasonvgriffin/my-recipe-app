import { useSyncExternalStore } from 'react';

import { featureGate, type FeatureAccess, type FeatureId } from '@/entitlements';
import { useSettings } from '@/hooks/use-settings';
import type { OptionalFeatures } from '@/types/recipe';

/** Gate status for a feature (entitlement + kill switch), live. Does NOT include the user's show/hide toggle. */
export function useFeature(id: FeatureId): FeatureAccess {
  // Re-render on gate changes; check() is cheap, so derive on each render.
  useSyncExternalStore(
    featureGate.subscribe,
    () => gateVersion(),
    () => gateVersion(),
  );
  return featureGate.check(id);
}

let version = 0;
featureGate.subscribe(() => {
  version += 1;
});
const gateVersion = () => version;

/** Settings toggle key for features the user can hide (RECIPES ARE THE CORE). */
const TOGGLE: Partial<Record<FeatureId, keyof OptionalFeatures>> = {
  mealPlan: 'mealPlan',
  shoppingList: 'shopping',
  groceryRun: 'shopping',
  pantry: 'pantry',
  receiptScan: 'pantry',
  barcodeScan: 'pantry',
};

/** Should this feature's entry points render? = gate allows it AND the user hasn't hidden it in Settings. */
export function useFeatureVisible(id: FeatureId): boolean {
  const access = useFeature(id);
  const { features } = useSettings();
  const toggle = TOGGLE[id];
  return access.available && (toggle ? features[toggle] : true);
}
