import { recipeStore } from '@/storage/recipes';

/** Coalesce overlapping seed calls. The flag in storage still decides whether anything is inserted. */
let inflight: Promise<void> | undefined;

export function ensureRecipesSeeded(): Promise<void> {
  if (!inflight) {
    inflight = recipeStore.seedIfNeeded().finally(() => {
      inflight = undefined;
    });
  }
  return inflight;
}
