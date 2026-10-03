import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { RECIPE_PHOTO_DIR, recipePhotoFileName } from '@/lib/photo-path';

export class PhotoPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoPermissionError';
  }
}

function photoDir(): Directory {
  const dir = new Directory(Paths.document, RECIPE_PHOTO_DIR);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/** Copy a picker result into app documents so it survives cache cleanup (spec #4). */
export async function persistRecipePhoto(sourceUri: string, recipeId: string): Promise<string> {
  const dest = new File(photoDir(), recipePhotoFileName(recipeId, sourceUri));
  if (dest.exists) dest.delete();
  await new File(sourceUri).copy(dest);
  return dest.uri;
}

/** Download an imported http(s) photo into app documents. */
export async function downloadRecipePhoto(url: string, recipeId: string): Promise<string> {
  const dest = new File(photoDir(), recipePhotoFileName(recipeId, url));
  if (dest.exists) dest.delete();
  const file = await File.downloadFileAsync(url, dest, { idempotent: true });
  return file.uri;
}

/** Cache copy used only for the share sheet, so a remote photo can be attached as a file. */
export async function downloadSharePhoto(url: string): Promise<string> {
  const dir = new Directory(Paths.cache, 'share-photos');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const dest = new File(dir, recipePhotoFileName('share', url));
  if (dest.exists) dest.delete();
  const file = await File.downloadFileAsync(url, dest, { idempotent: true });
  return file.uri;
}

export function deleteLocalPhoto(uri: string | undefined): void {
  if (!uri?.startsWith('file://') || !uri.includes(`${RECIPE_PHOTO_DIR}/`)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A missing file should not block removing the photo from the recipe.
  }
}

/** Camera or gallery. Returns null when the user cancels. Throws PhotoPermissionError if the camera is denied. */
export async function pickRecipePhoto(source: 'camera' | 'library', recipeId: string): Promise<string | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new PhotoPermissionError('Camera permission is needed to take a recipe photo.');
    }
  }
  const launch =
    source === 'camera'
      ? ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
      : ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
  const result = await launch;
  if (result.canceled || !result.assets[0]) return null;
  return persistRecipePhoto(result.assets[0].uri, recipeId);
}
