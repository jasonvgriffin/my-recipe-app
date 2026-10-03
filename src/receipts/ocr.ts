import { recognize } from 'mlkit-text-recognition';

/**
 * On-device OCR for a receipt photo (spec #26).
 * Google ML Kit text recognition, bundled Latin model — offline, no API key.
 * The native module is linked by the Expo config plugin / autolinking and built in prebuild.
 */
export async function recognizeReceiptText(uri: string): Promise<string> {
  const text = await recognize(uri);
  return text.trim();
}
