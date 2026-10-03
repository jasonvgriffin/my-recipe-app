/** Local photo path helpers (spec #4). No Expo imports so tests stay pure. */

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif']);

export function extensionFromUri(uri: string): string {
  const path = uri.split('?')[0].split('#')[0];
  const match = path.match(/\.([a-zA-Z0-9]+)$/);
  const ext = (match?.[1] ?? 'jpg').toLowerCase();
  return IMAGE_EXT.has(ext) ? ext : 'jpg';
}

export function mimeForUri(uri: string): string {
  switch (extensionFromUri(uri)) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'heic':
      return 'image/heic';
    default:
      return 'image/jpeg';
  }
}

export function isRemotePhoto(uri: string | undefined): boolean {
  return !!uri && /^https?:\/\//i.test(uri.trim());
}

/** File name inside the app documents `recipe-photos` directory. */
export function recipePhotoFileName(recipeId: string, sourceUri: string): string {
  const safe = recipeId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'recipe';
  return `${safe}.${extensionFromUri(sourceUri)}`;
}

export const RECIPE_PHOTO_DIR = 'recipe-photos';
