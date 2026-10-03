import { importPathFromIncomingUrl } from '@/import/deep-link';

/**
 * Android share-sheet receive (spec #1). expo-sharing opens `myrecipeapp://expo-sharing`;
 * land on the import screen, which calls importRecipe and shows a draft before saving.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return importPathFromIncomingUrl(path);
}
