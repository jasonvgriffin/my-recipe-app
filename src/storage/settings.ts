import { DEFAULT_SETTINGS, type AppSettings } from '@/types/recipe';

import { defaultStore, type KeyValueStore } from './kv';

export const SETTINGS_STORAGE_KEY = 'my-recipe-app/settings/v1';

/**
 * App settings (per device, not synced): unit system #16, cooking-mode keep-awake #19, cooked-recently window #9,
 * optional feature visibility (recipes-first rule). Subscribers are notified on update so tabs/screens react live.
 */
export function createSettingsStore(store: KeyValueStore = defaultStore) {
  const listeners = new Set<(s: AppSettings) => void>();
  const merge = (raw: Partial<AppSettings>): AppSettings => ({
    ...DEFAULT_SETTINGS,
    ...raw,
    features: { ...DEFAULT_SETTINGS.features, ...raw.features },
  });
  const api = {
    async get(): Promise<AppSettings> {
      try {
        const raw = await store.getItem(SETTINGS_STORAGE_KEY);
        return merge(raw ? (JSON.parse(raw) as Partial<AppSettings>) : {});
      } catch {
        return merge({});
      }
    },
    async update(patch: Partial<AppSettings>): Promise<AppSettings> {
      const current = await api.get();
      const next = merge({ ...current, ...patch, features: { ...current.features, ...patch.features } });
      await store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      listeners.forEach((l) => l(next));
      return next;
    },
    subscribe(listener: (s: AppSettings) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return api;
}

export const settingsStore = createSettingsStore();
