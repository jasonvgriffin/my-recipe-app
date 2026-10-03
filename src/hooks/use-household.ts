import { useSyncExternalStore } from 'react';

import { getHouseholdSnapshot, subscribeHouseholdRuntime } from '@/household/state';

/** Live household + sync status. Does not start the Supabase client (see `useHouseholdSync`). */
export function useHousehold() {
  return useSyncExternalStore(subscribeHouseholdRuntime, getHouseholdSnapshot, getHouseholdSnapshot);
}
