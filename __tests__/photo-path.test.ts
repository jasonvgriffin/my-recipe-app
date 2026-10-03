import { extensionFromUri, isRemotePhoto, mimeForUri, recipePhotoFileName } from '@/lib/photo-path';

describe('recipe photo paths (spec #4)', () => {
  it('keeps a safe file name and a known image extension', () => {
    expect(recipePhotoFileName('abc-123', 'file:///cache/IMG.HEIC?x=1')).toBe('abc-123.heic');
    expect(recipePhotoFileName('../etc/passwd', 'https://cdn.example.com/a.webp')).toBe('etcpasswd.webp');
    expect(extensionFromUri('no-extension')).toBe('jpg');
    expect(mimeForUri('file:///a.png')).toBe('image/png');
    expect(isRemotePhoto('https://example.com/a.jpg')).toBe(true);
    expect(isRemotePhoto('file:///docs/a.jpg')).toBe(false);
  });
});
