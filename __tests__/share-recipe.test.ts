import { createRecipe } from '@/lib/recipe-utils';
import { buildShareRequest, formatRecipeShareText } from '@/lib/share-recipe';

const recipe = createRecipe({
  title: 'Allulose mousse',
  ingredients: [{ text: '1/3 cup powdered allulose', substitutionNote: 'allulose instead of sugar' }],
  steps: [{ text: 'Chill 2 hours.', durationSeconds: 7200 }],
  tags: [],
  servings: 4,
  notes: 'Soft peaks.',
  sourceUrl: 'https://example.com/mousse',
  photoUri: 'file:///docs/recipe-photos/mousse.jpg',
});

describe('share payload (spec #14)', () => {
  it('builds text, photo, link, and every combination', () => {
    const text = buildShareRequest(recipe, { text: true, photo: false, link: false });
    const photo = buildShareRequest(recipe, { text: false, photo: true, link: false });
    const link = buildShareRequest(recipe, { text: false, photo: false, link: true });
    const all = buildShareRequest(recipe, { text: true, photo: true, link: true });
    if (!text.ok || !photo.ok || !link.ok || !all.ok) throw new Error('expected ok');

    expect(text.request.message).toContain('Allulose mousse');
    expect(text.request.message).toContain('Substitution: allulose instead of sugar');
    expect(text.request.message).toContain('Soft peaks.');
    expect(text.request.fileUri).toBeUndefined();

    expect(photo.request.message).toBeUndefined();
    expect(photo.request.fileUri).toBe(recipe.photoUri);
    expect(photo.request.mimeType).toBe('image/jpeg');

    expect(link.request.message).toBe('https://example.com/mousse');
    expect(link.request.fileUri).toBeUndefined();

    expect(all.request.message).toContain('Source: https://example.com/mousse');
    expect(all.request.fileUri).toBe(recipe.photoUri);
  });

  it('uses a remote photo URL', () => {
    const unknown = createRecipe({
      title: 'Eggs',
      ingredients: [{ text: '2 eggs' }],
      steps: [{ text: 'Scramble.' }],
      tags: [],
      servings: 1,
      photoUri: 'https://cdn.example.com/eggs.png',
    });
    expect(formatRecipeShareText(unknown)).not.toMatch(/carb/i);
    const shared = buildShareRequest(unknown, { text: false, photo: true, link: false });
    if (!shared.ok) throw new Error(shared.error);
    expect(shared.request.remotePhotoUrl).toBe('https://cdn.example.com/eggs.png');
    expect(shared.request.mimeType).toBe('image/png');
  });

  it('explains a missing choice, photo, or link', () => {
    expect(buildShareRequest(recipe, { text: false, photo: false, link: false })).toMatchObject({ ok: false });
    const noPhoto = createRecipe({
      title: 'Eggs',
      ingredients: [{ text: '2 eggs' }],
      steps: [{ text: 'Scramble.' }],
      tags: [],
      servings: 1,
    });
    expect(buildShareRequest(noPhoto, { text: false, photo: true, link: false }).ok).toBe(false);
    expect(buildShareRequest(noPhoto, { text: false, photo: false, link: true }).ok).toBe(false);
  });
});
