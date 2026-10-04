import { useCallback, useState } from 'react';

import { useFeature } from '@/hooks/use-feature';
import { useSettings } from '@/hooks/use-settings';
import { exportRecipesPdf, printRecipesPdf } from '@/lib/export-pdf';
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

  const run = useCallback(
    async (recipes: readonly Recipe[], action: 'share' | 'print'): Promise<boolean> => {
      setError(null);
      setBusy(true);
      try {
        const list = unitsEnabled ? recipes : recipes.map((r) => ({ ...r, unitSystem: 'original' as const }));
        const options = { unitSystem: unitsEnabled ? settings.unitSystem : ('original' as const) };
        if (action === 'print') await printRecipesPdf(list, options);
        else await exportRecipesPdf(list, options);
        return true;
      } catch (e) {
        const fallback = action === 'print' ? 'Could not print the PDF.' : 'Could not create the PDF.';
        setError(e instanceof Error ? e.message : fallback);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [settings.unitSystem, unitsEnabled],
  );
  const exportPdf = useCallback((recipes: readonly Recipe[]) => run(recipes, 'share'), [run]);
  /** v1.0.7: Print — opens Android's system print dialog for the same PDF. */
  const printPdf = useCallback((recipes: readonly Recipe[]) => run(recipes, 'print'), [run]);

  return { available, busy, error, exportPdf, printPdf };
}
