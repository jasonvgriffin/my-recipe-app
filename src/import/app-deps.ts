import { recipeStore } from '@/storage/recipes';

import type { ImportDeps } from './import-recipe';

/** On-device dependencies: AsyncStorage-backed recipe store, global fetch, system clock. */
export const appImportDeps: ImportDeps = {
  store: recipeStore,
  fetchHtml: async (url) => {
    const res = await fetch(url, { headers: { Accept: 'text/html,application/xhtml+xml' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  },
  now: () => new Date(),
};
