import { requireNativeModule } from 'expo';

export interface RecipeShareOptions {
  message?: string | null;
  title?: string | null;
  fileUri?: string | null;
  mimeType?: string | null;
}

interface RecipeShareNative {
  shareAsync(options: RecipeShareOptions): Promise<void>;
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
