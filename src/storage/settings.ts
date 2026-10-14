import { isAppIconId } from '@/lib/app-icon-ids';
import { isAccentId, isThemeMode } from '@/lib/theme';
import { DEFAULT_SETTINGS, type AppSettings, type AppearanceSettings, type OptionalFeatures } from '@/types/recipe';

import { defaultStore, type KeyValueStore } from './kv';

export const SETTINGS_STORAGE_KEY = 'my-recipe-app/settings/v1';

/**
 * App settings (per device): unit system #16, optional feature visibility (recipes-first rule), appearance
 * (theme mode + accent, v1.0.3). Subscribers are notified on update so tabs/screens react live.
 * Removed keys (cookedRecentlyDays, cookingModeKeepAwake) are ignored so an old backup still loads.
 */
export function createSettingsStore(store: KeyValueStore = defaultStore) {
  const listeners = new Set<(s: AppSettings) => void>();
  const merge = (raw: Partial<AppSettings> & { cookedRecentlyDays?: unknown; cookingModeKeepAwake?: unknown }): AppSettings => {
    // v1.0.2: the "cooked recently" window is fixed. v1.1.0: cooking-mode keep-awake is gone.
    const { cookedRecentlyDays: _legacy, cookingModeKeepAwake: _awake, ...rest } = raw;
    return {
      ...DEFAULT_SETTINGS,
      ...rest,
      features: { ...DEFAULT_SETTINGS.features, ...raw.features },
      appearance: mergeAppearance(raw.appearance),
    };
  };
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
      patch: Partial<Omit<AppSettings, 'features' | 'appearance'>> & {
        features?: Partial<OptionalFeatures>;
        appearance?: Partial<AppearanceSettings>;
      },
    ): Promise<AppSettings> {
      const run = queue.then(async () => {
        const current = await api.get();
        const next = merge({
          ...current,
          ...patch,
          features: { ...current.features, ...patch.features },
          appearance: { ...current.appearance, ...patch.appearance },
        });
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

/** Appearance (v1.0.3) with defaults; unknown stored values fall back to System / the default accent (Purple since v1.1.2). A saved accent id is kept. */
function mergeAppearance(raw: Partial<AppearanceSettings> | undefined): AppearanceSettings {
  const d = DEFAULT_SETTINGS.appearance;
  return {
    themeMode: isThemeMode(raw?.themeMode) ? raw.themeMode : d.themeMode,
    accent: isAccentId(raw?.accent) ? raw.accent : d.accent,
    appIcon: isAppIconId(raw?.appIcon) ? raw.appIcon : d.appIcon,
  };
}

export const settingsStore = createSettingsStore();
