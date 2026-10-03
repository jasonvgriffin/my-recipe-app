import { DEFAULT_SETTINGS, type AppSettings, type OptionalFeatures } from '@/types/recipe';

import { defaultStore, type KeyValueStore } from './kv';

export const SETTINGS_STORAGE_KEY = 'my-recipe-app/settings/v1';

/** "Cooked recently" window (spec #9). Anything unusable falls back to the default (14). */
export function clampCookedRecentlyDays(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.cookedRecentlyDays;
  return Math.min(365, Math.max(1, Math.round(n)));
}

/**
 * App settings (per device, not synced): unit system #16, cooking-mode keep-awake #19, cooked-recently window #9,
 * optional feature visibility (recipes-first rule). Subscribers are notified on update so tabs/screens react live.
 */
export function createSettingsStore(store: KeyValueStore = defaultStore) {
  const listeners = new Set<(s: AppSettings) => void>();
  const merge = (raw: Partial<AppSettings>): AppSettings => ({
    ...DEFAULT_SETTINGS,
    ...raw,
    cookedRecentlyDays: clampCookedRecentlyDays(raw.cookedRecentlyDays),
    features: { ...DEFAULT_SETTINGS.features, ...raw.features },
  });
  /** Serializes read-modify-write so two toggles in the same tick don't clobber each other. */
  let queue: Promise<unknown> = Promise.resolve();
  const api = {
    async get(): Promise<AppSettings> {
      try {
        const raw = await store.getItem(SETTINGS_STORAGE_KEY);
        return merge(raw ? (JSON.parse(raw) as Partial<AppSettings>) : {});
      } catch {
        return merge({});
      }
    },
    update(
      patch: Partial<Omit<AppSettings, 'features'>> & { features?: Partial<OptionalFeatures> },
    ): Promise<AppSettings> {
      const run = queue.then(async () => {
        const current = await api.get();
        const next = merge({ ...current, ...patch, features: { ...current.features, ...patch.features } });
        await store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
        listeners.forEach((l) => l(next));
        return next;
      });
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    subscribe(listener: (s: AppSettings) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return api;
}

export const settingsStore = createSettingsStore();
