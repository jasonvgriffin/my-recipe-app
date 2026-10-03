import { requireNativeModule } from 'expo-modules-core';

type MlkitTextRecognitionNative = {
  /** On-device Latin text recognition. Resolves to the full OCR string (lines separated by newlines). */
  recognize(uri: string): Promise<string>;
};

let native: MlkitTextRecognitionNative | undefined;

/**
 * Read text from a photo with Google ML Kit (bundled Latin model: offline, no API key).
 * Android only in v1; the receipt screen shows a clear error on other platforms.
 */
export function recognize(uri: string): Promise<string> {
  if (!native) native = requireNativeModule<MlkitTextRecognitionNative>('MlkitTextRecognition');
  return native.recognize(uri);
}
