import { presentIngredient } from '@/lib/ingredients';
import { formatDurationWords } from '@/lib/timers';
import { effectiveUnitSystem } from '@/lib/units';
import type { Recipe, UnitSystem } from '@/types/recipe';

/**
 * Printable recipe PDF (v1.0.3, spec #14 “Export PDF”). Pure HTML builder — no Expo imports, so it is unit-tested;
 * `src/lib/export-pdf.ts` renders it with expo-print and opens the share sheet. One recipe per page; title, photo,
 * servings and timed-step total, ingredients, steps, notes, tags, source link. NEVER nutrition (recipe app, not a
 * nutrition app). Always black on white for printing, whatever the app theme (so it is exempt from the theme).
 */
export type PdfRecipe = Pick<
  Recipe,
  'title' | 'description' | 'servings' | 'ingredients' | 'steps' | 'notes' | 'tags' | 'sourceUrl' | 'unitSystem'
>;

export interface RecipePdfOptions {
  /** App default unit display; each recipe's own choice wins (same as the detail screen). */
  unitSystem?: UnitSystem | 'original';
  /** Image src per recipe (data: URI for local photos, https for remote); undefined = no photo. */
  photoSrc?: (recipe: PdfRecipe, index: number) => string | undefined;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Sum of the step timers, or undefined when no step is timed. */
export function totalStepSeconds(recipe: Pick<Recipe, 'steps'>): number | undefined {
  const total = recipe.steps.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0);
  return total > 0 ? total : undefined;
}

const CSS = `
  @page { margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; color: #111; background: #fff;
         font-size: 12pt; line-height: 1.45; margin: 0; }
  .recipe { page-break-after: always; break-after: page; }
  .recipe:last-child { page-break-after: auto; break-after: auto; }
  h1 { font-size: 22pt; margin: 0 0 6pt; line-height: 1.2; }
  h2 { font-size: 13pt; margin: 16pt 0 6pt; padding-bottom: 3pt; border-bottom: 1px solid #ccc;
       text-transform: uppercase; letter-spacing: 0.04em; }
  .desc { color: #333; margin: 0 0 8pt; }
  .meta { color: #444; margin: 0 0 10pt; }
  .meta span + span::before { content: " · "; }
  .photo { display: block; max-width: 100%; max-height: 90mm; object-fit: cover; border-radius: 6px; margin: 6pt 0 10pt; }
  ul, ol { margin: 0; padding-left: 20pt; }
  li { margin: 0 0 4pt; page-break-inside: avoid; break-inside: avoid; }
  .sub { color: #555; font-size: 10.5pt; }
  .timer { color: #555; font-size: 10.5pt; white-space: nowrap; }
  .notes { white-space: pre-wrap; }
  .tags { color: #333; }
  .source { color: #555; font-size: 10pt; margin-top: 14pt; word-break: break-all; }
`;

function recipeSection(recipe: PdfRecipe, index: number, options: RecipePdfOptions): string {
  const system = effectiveUnitSystem(recipe, { unitSystem: options.unitSystem ?? 'original' });
  const photo = options.photoSrc?.(recipe, index);
  const total = totalStepSeconds(recipe);
  const meta = [`<span>Servings: ${escapeHtml(String(recipe.servings))}</span>`];
  if (total) meta.push(`<span>Timed steps: ${escapeHtml(formatDurationWords(total))}</span>`);
  const ingredients = recipe.ingredients
    .filter((i) => i.text.trim())
    .map((i) => {
      const sub = i.substitutionNote?.trim()
        ? `<br><span class="sub">Substitution: ${escapeHtml(i.substitutionNote.trim())}</span>`
        : '';
      return `<li>${escapeHtml(presentIngredient(i, { unitSystem: system }))}${sub}</li>`;
    })
    .join('');
  const steps = recipe.steps
    .filter((s) => s.text.trim())
    .map((s) => {
      const timer = s.durationSeconds
        ? ` <span class="timer">(${escapeHtml(formatDurationWords(s.durationSeconds))})</span>`
        : '';
      return `<li>${escapeHtml(s.text)}${timer}</li>`;
    })
    .join('');
  const parts = [
    `<section class="recipe">`,
    `<h1>${escapeHtml(recipe.title)}</h1>`,
    recipe.description?.trim() ? `<p class="desc">${escapeHtml(recipe.description.trim())}</p>` : '',
    photo ? `<img class="photo" src="${escapeHtml(photo)}" alt="">` : '',
    `<p class="meta">${meta.join('')}</p>`,
    `<h2>Ingredients</h2><ul>${ingredients}</ul>`,
    `<h2>Steps</h2><ol>${steps}</ol>`,
    recipe.notes?.trim() ? `<h2>Notes</h2><p class="notes">${escapeHtml(recipe.notes.trim())}</p>` : '',
    recipe.tags.length ? `<h2>Tags</h2><p class="tags">${recipe.tags.map(escapeHtml).join(', ')}</p>` : '',
    recipe.sourceUrl ? `<p class="source">Source: ${escapeHtml(recipe.sourceUrl)}</p>` : '',
    `</section>`,
  ];
  return parts.filter(Boolean).join('\n');
}

/** Full HTML document for one or more recipes (one per page). */
export function buildRecipesPdfHtml(recipes: readonly PdfRecipe[], options: RecipePdfOptions = {}): string {
  const title = recipes.length === 1 ? recipes[0].title : `${recipes.length} recipes`;
  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title><style>${CSS}</style></head><body>`,
    recipes.map((r, i) => recipeSection(r, i, options)).join('\n'),
    '</body></html>',
  ].join('\n');
}

/** Share-sheet file name: “Chicken Soup.pdf”, or “My Recipes (3).pdf” for several. */
export function pdfFileName(recipes: readonly Pick<Recipe, 'title'>[]): string {
  if (recipes.length !== 1) return `My Recipes (${recipes.length}).pdf`;
  const safe = recipes[0].title
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${safe || 'Recipe'}.pdf`;
}
