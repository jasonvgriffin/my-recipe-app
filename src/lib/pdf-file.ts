/** Phone side of Import PDF: the system file picker (Storage Access Framework) — no storage permission needed. */
import { File } from 'expo-file-system';

/** Pick a PDF and read its bytes. Null when cancelled. */
export async function pickPdfBytes(): Promise<{ name: string; bytes: Uint8Array } | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/pdf'] });
  if (picked.canceled || !picked.result) return null;
  return { name: picked.result.name, bytes: await picked.result.bytes() };
}

/** Read a PDF handed to the app by another app (share sheet / "Open with"). */
export async function readPdfUri(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}
