import { useCallback, useState } from 'react';

import { useFeature } from '@/hooks/use-feature';
import { useSettings } from '@/hooks/use-settings';
import { exportRecipesPdf } from '@/lib/export-pdf';
import type { Recipe } from '@/types/recipe';

/**
 * “Export PDF” for the recipe detail and Existing Recipes multi-select (v1.0.3). `available` follows the
 * `pdfExport` gate; units follow the app/recipe setting unless unit conversion is off (then as written).
 */
export function usePdfExport() {
  const available = useFeature('pdfExport').available;
  const unitsEnabled = useFeature('unitConversion').available;
  const settings = useSettings();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportPdf = useCallback(
    async (recipes: readonly Recipe[]): Promise<boolean> => {
      setError(null);
      setBusy(true);
      try {
        const list = unitsEnabled ? recipes : recipes.map((r) => ({ ...r, unitSystem: 'original' as const }));
        await exportRecipesPdf(list, { unitSystem: unitsEnabled ? settings.unitSystem : 'original' });
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not create the PDF.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [settings.unitSystem, unitsEnabled],
  );

  return { available, busy, error, exportPdf };
}
