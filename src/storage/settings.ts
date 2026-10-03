import { DEFAULT_SETTINGS, type AppSettings } from '@/types/recipe';

import { defaultStore, type KeyValueStore } from './kv';

export const SETTINGS_STORAGE_KEY = 'my-recipe-app/settings/v1';

/** App settings (unit system #16, cooking-mode keep-awake #19, cooked-recently window #9). */
export function createSettingsStore(store: KeyValueStore = defaultStore) {
  return {
    async get(): Promise<AppSettings> {
      try {
        const raw = await store.getItem(SETTINGS_STORAGE_KEY);
        return { ...DEFAULT_SETTINGS, ...(raw ? (JSON.parse(raw) as Partial<AppSettings>) : {}) };
      } catch {
        return { ...DEFAULT_SETTINGS };
      }
    },
    async update(patch: Partial<AppSettings>): Promise<AppSettings> {
      const next = { ...(await this.get()), ...patch };
      await store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      return next;
    },
  };
}

export const settingsStore = createSettingsStore();
