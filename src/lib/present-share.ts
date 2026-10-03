import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';
import { shareAsync } from 'recipe-share';

import { downloadSharePhoto } from '@/lib/photos';
import type { ShareRequest } from '@/lib/share-recipe';

/**
 * Open the platform share sheet for a prepared recipe payload (spec #14): text, photo, link, or a PDF file
 * (`exportRecipesPdf`, v1.0.3).
 * Android uses the local RecipeShare module so text, photo and link can go out together.
 * Other platforms use React Native Share and expo-sharing.
 */
export async function presentShare(request: ShareRequest): Promise<void> {
  let fileUri = request.fileUri;
  if (request.remotePhotoUrl) fileUri = await downloadSharePhoto(request.remotePhotoUrl);
  const message = request.message;
  const mimeType = request.mimeType ?? (fileUri ? 'image/jpeg' : undefined);

  if (Platform.OS === 'android') {
    await shareAsync({ message, title: request.title, fileUri, mimeType });
    return;
  }

  if (fileUri && message) {
    await Share.share({ message, url: fileUri, title: request.title });
    return;
  }
  if (fileUri) {
    const UTI = mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'public.image';
    await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: request.title, UTI });
    return;
  }
  await Share.share({ message: message ?? '', title: request.title });
}
