import { Redirect } from 'expo-router';

/**
 * Placeholder route behind the center “+” tab (v1.0.2). Pressing the tab never navigates here — it opens
 * `AddMenuSheet` (see `(tabs)/_layout.tsx`). A stray deep link to /add-menu just lands on Recipes.
 */
export default function AddMenuRoute() {
  return <Redirect href="/" />;
}
