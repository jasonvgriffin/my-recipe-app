import { useEffect, useState } from 'react';

import { settingsStore } from '@/storage/settings';
import { DEFAULT_SETTINGS, type AppSettings } from '@/types/recipe';

/** Current app settings, updated live when changed anywhere (e.g. hiding optional tabs). */
export function useSettings(): AppSettings {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  useEffect(() => {
    let active = true;
    settingsStore.get().then((s) => active && setSettings(s));
    const unsubscribe = settingsStore.subscribe(setSettings);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return settings;
}
