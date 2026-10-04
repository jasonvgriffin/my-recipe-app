import { requireNativeModule } from 'expo';

export interface RecipeShareOptions {
  message?: string | null;
  title?: string | null;
  fileUri?: string | null;
  mimeType?: string | null;
}

interface RecipeShareNative {
  shareAsync(options: RecipeShareOptions): Promise<void>;
  getAppIcon(aliasSuffixes: string[]): string | null;
  setAppIcon(target: string, aliasSuffixes: string[]): Promise<string>;
  saveDocumentAsync(options: SaveDocumentOptions): Promise<string | null>;
}

export interface SaveDocumentOptions {
  /** Local file:// URI inside the app's files or cache folder. */
  fileUri: string;
  /** Suggested file name shown in the save dialog. */
  fileName: string;
  mimeType: string;
}

/**
 * v1.0.7: Android "Save as" (SAF ACTION_CREATE_DOCUMENT): the user picks where (Google Drive, Downloads, …) and the
 * name; the file is copied there. Resolves the saved document URI, or null when cancelled.
 */
export function saveDocumentAsync(options: SaveDocumentOptions): Promise<string | null> {
  return requireNativeModule<RecipeShareNative>('RecipeShare').saveDocumentAsync(options);
}

/** Opens the Android share sheet. Text, a local file, or both. */
export function shareAsync(options: RecipeShareOptions): Promise<void> {
  return requireNativeModule<RecipeShareNative>('RecipeShare').shareAsync({
    message: options.message ?? null,
    title: options.title ?? null,
    fileUri: options.fileUri ?? null,
    mimeType: options.mimeType ?? null,
  });
}

/**
 * Launcher icon aliases (v1.0.6). `aliasSuffixes[0]` must be the default alias. Returns the enabled alias suffix.
 */
export function getAppIcon(aliasSuffixes: string[]): string | null {
  return requireNativeModule<RecipeShareNative>('RecipeShare').getAppIcon(aliasSuffixes);
}

/** Switch the launcher icon: enables `target`, disables the other aliases (no app restart). */
export function setAppIcon(target: string, aliasSuffixes: string[]): Promise<string> {
  return requireNativeModule<RecipeShareNative>('RecipeShare').setAppIcon(target, aliasSuffixes);
}
