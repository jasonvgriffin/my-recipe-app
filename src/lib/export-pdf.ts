import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';

import { canUse } from '@/entitlements';
import { isRemotePhoto, mimeForUri } from '@/lib/photo-path';
import { presentShare } from '@/lib/present-share';
import { buildRecipesPdfHtml, pdfFileName } from '@/lib/recipe-pdf';
import type { Recipe, UnitSystem } from '@/types/recipe';

export class PdfExportUnavailableError extends Error {
  constructor() {
    super('PDF export is not available.');
    this.name = 'PdfExportUnavailableError';
  }
}

/** Inline local photos as data: URIs (the print WebView can't load file://); remote photos load by URL. */
async function photoSource(photoUri: string | undefined, includePhotos: boolean): Promise<string | undefined> {
  if (!includePhotos || !photoUri) return undefined;
  if (isRemotePhoto(photoUri)) return photoUri;
  try {
    const file = new File(photoUri);
    if (!file.exists) return undefined;
    return `data:${mimeForUri(photoUri)};base64,${await file.base64()}`;
  } catch {
    return undefined; // a missing photo never blocks the export
  }
}

/** Render the recipes to a PDF in the cache with a readable file name (shared by Share and Print). */
async function buildRecipesPdfFile(
  recipes: readonly Recipe[],
  options: { unitSystem?: UnitSystem | 'original' },
): Promise<File> {
  if (!canUse('pdfExport')) throw new PdfExportUnavailableError();
  if (recipes.length === 0) throw new Error('Pick at least one recipe.');
  const includePhotos = canUse('photos');
  const photos = await Promise.all(recipes.map((r) => photoSource(r.photoUri, includePhotos)));
  const html = buildRecipesPdfHtml(recipes, { unitSystem: options.unitSystem, photoSrc: (_r, i) => photos[i] });
  const printed = await Print.printToFileAsync({ html });

  // Give the file a readable name for the share sheet / print job (expo-print uses a random one).
  const dir = new Directory(Paths.cache, 'recipe-pdfs');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, pdfFileName(recipes));
  if (dest.exists) dest.delete();
  await new File(printed.uri).move(dest);
  return dest;
}

/**
 * Export one or more recipes as a printable PDF and open the system share sheet (save to Files/Drive, mail,
 * text…). v1.0.3. Gated by `pdfExport` (requires `share`); photos only when the `photos` feature is on.
 * Reuses `presentShare` (Android: the RecipeShare module's FileProvider; elsewhere expo-sharing).
 */
export async function exportRecipesPdf(
  recipes: readonly Recipe[],
  options: { unitSystem?: UnitSystem | 'original' } = {},
): Promise<void> {
  const dest = await buildRecipesPdfFile(recipes, options);
  const title = recipes.length === 1 ? recipes[0].title : `${recipes.length} recipes`;
  await presentShare({ title, fileUri: dest.uri, mimeType: 'application/pdf' });
}

/**
 * v1.0.7: the same PDF, sent to the system print dialog (Android print framework via expo-print printAsync).
 * Same gate as Share PDF.
 */
export async function printRecipesPdf(
  recipes: readonly Recipe[],
  options: { unitSystem?: UnitSystem | 'original' } = {},
): Promise<void> {
  const dest = await buildRecipesPdfFile(recipes, options);
  await Print.printAsync({ uri: dest.uri });
}
