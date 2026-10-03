import { formatIngredient } from '@/lib/ingredients';
import { isRemotePhoto, mimeForUri } from '@/lib/photo-path';
import { formatDuration } from '@/lib/timers';
import { netCarbs, type Recipe } from '@/types/recipe';

/** What the share sheet should include (spec #14). Any combination is valid. */
export interface ShareParts {
  text: boolean;
  photo: boolean;
  link: boolean;
}

export interface ShareRequest {
  title: string;
  /** Recipe text and/or the source link. Absent when only a photo was selected. */
  message?: string;
  /** Local file:// photo. */
  fileUri?: string;
  /** Remote photo to download into the cache before the sheet opens. */
  remotePhotoUrl?: string;
  mimeType?: string;
}

type ShareRecipe = Pick<
  Recipe,
  'title' | 'servings' | 'nutrition' | 'ingredients' | 'steps' | 'notes' | 'sourceUrl' | 'photoUri'
>;

/** Plain-text recipe for the share sheet. Net carbs stay "unknown" when they are not set. */
export function formatRecipeShareText(recipe: ShareRecipe): string {
  const net = netCarbs(recipe.nutrition);
  const lines: string[] = [
    recipe.title,
    '',
    `Servings: ${recipe.servings}`,
    `Net carbs per serving: ${net === undefined ? 'unknown' : `${net} g`}`,
    '',
    'Ingredients',
  ];
  for (const ingredient of recipe.ingredients) {
    lines.push(`- ${formatIngredient(ingredient)}`);
    if (ingredient.substitutionNote?.trim()) lines.push(`  Substitution: ${ingredient.substitutionNote.trim()}`);
  }
  lines.push('', 'Steps');
  recipe.steps.forEach((step, index) => {
    const timer = step.durationSeconds ? ` (${formatDuration(step.durationSeconds)})` : '';
    lines.push(`${index + 1}. ${step.text}${timer}`);
  });
  if (recipe.notes?.trim()) lines.push('', 'Notes', recipe.notes.trim());
  return lines.join('\n');
}

export function buildShareRequest(
  recipe: ShareRecipe,
  parts: ShareParts,
): { ok: true; request: ShareRequest } | { ok: false; error: string } {
  if (!parts.text && !parts.photo && !parts.link) return { ok: false, error: 'Choose at least one thing to share.' };
  if (parts.photo && !recipe.photoUri) return { ok: false, error: 'This recipe has no photo to share.' };
  if (parts.link && !recipe.sourceUrl) return { ok: false, error: 'This recipe has no source link to share.' };

  const chunks: string[] = [];
  if (parts.text) chunks.push(formatRecipeShareText(recipe));
  if (parts.link && recipe.sourceUrl) chunks.push(parts.text ? `Source: ${recipe.sourceUrl}` : recipe.sourceUrl);
  const message = chunks.filter(Boolean).join('\n\n') || undefined;

  let fileUri: string | undefined;
  let remotePhotoUrl: string | undefined;
  if (parts.photo && recipe.photoUri) {
    if (isRemotePhoto(recipe.photoUri)) remotePhotoUrl = recipe.photoUri;
    else fileUri = recipe.photoUri;
  }
  if (!message && !fileUri && !remotePhotoUrl) return { ok: false, error: 'Nothing to share.' };

  return {
    ok: true,
    request: {
      title: recipe.title,
      message,
      fileUri,
      remotePhotoUrl,
      mimeType: parts.photo && recipe.photoUri ? mimeForUri(recipe.photoUri) : undefined,
    },
  };
}
