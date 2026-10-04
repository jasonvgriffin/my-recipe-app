/**
 * Import PDF (v1.0.6): read recipes out of a PDF on the phone — no network, no paid APIs, no new permissions.
 * PDF bytes → text per page (extract-text.ts) → one chunk per recipe (recipes.ts) → the same text parser and import
 * pipeline as pasted text (`importRecipeWith`, kind 'text', channel 'pdf'). Candidates are dry runs; the screen saves
 * only the ones the user keeps.
 */
import { importRecipeWith, type ImportDeps } from '../import-recipe';
import type { ImportResult } from '../types';

import { extractPdfText, NotAPdfError } from './extract-text';
import { splitRecipeTexts } from './recipes';

export interface PdfCandidate {
  /** Chunk of PDF text this recipe came from (used to import it for real). */
  text: string;
  result: Extract<ImportResult, { ok: true }>;
}

export type PdfReadResult =
  | { ok: true; candidates: PdfCandidate[]; skipped: string[] }
  | { ok: false; reason: 'not_pdf' | 'unreadable' | 'no_text' | 'no_recipes' | 'locked'; message: string };

export const PDF_MESSAGES = {
  not_pdf: 'That file is not a PDF.',
  unreadable: 'Couldn’t open this PDF. It may be damaged or password-protected.',
  no_text:
    'Couldn’t read text from this PDF. It looks like a scan or photo (images only), and this app reads PDFs that contain text.',
  no_recipes: 'No recipes found in this PDF. Look for a title, an “Ingredients” list and steps.',
  locked: 'Importing recipes is not available.',
} as const;

const fail = (reason: Exclude<PdfReadResult, { ok: true }>['reason']): PdfReadResult => ({
  ok: false,
  reason,
  message: PDF_MESSAGES[reason],
});

export async function readRecipesFromPdf(bytes: Uint8Array, deps: ImportDeps): Promise<PdfReadResult> {
  let pages: string[];
  try {
    const text = extractPdfText(bytes);
    if (!text.hasText) return fail('no_text');
    pages = text.pages;
  } catch (e) {
    return fail(e instanceof NotAPdfError ? 'not_pdf' : 'unreadable');
  }
  const candidates: PdfCandidate[] = [];
  const skipped: string[] = [];
  for (const chunk of splitRecipeTexts(pages)) {
    const result = await importRecipeWith(
      deps,
      { kind: 'text', text: chunk.slice(0, 100_000), source: { channel: 'pdf' } },
      { dryRun: true },
    );
    if (result.ok) candidates.push({ text: chunk, result });
    else if (result.code === 'feature_locked') return fail('locked');
    else if (result.code === 'forbidden_ingredient')
      skipped.push(`${chunk.split('\n')[0]}: ${result.errors.join(' ')}`);
  }
  if (candidates.length === 0) {
    return skipped.length ? { ok: true, candidates, skipped } : fail('no_recipes');
  }
  return { ok: true, candidates, skipped };
}

/** Save the chosen candidates (in order) into the given categories. Duplicates (same source link) are left alone. */
export async function importPdfCandidates(
  chosen: PdfCandidate[],
  categoryIds: string[],
  deps: ImportDeps,
): Promise<ImportResult[]> {
  const out: ImportResult[] = [];
  for (const c of chosen) {
    out.push(
      await importRecipeWith(
        deps,
        { kind: 'text', text: c.text.slice(0, 100_000), source: { channel: 'pdf' } },
        { categoryIds },
      ),
    );
  }
  return out;
}

export { extractPdfText, NotAPdfError } from './extract-text';
export { splitRecipeTexts } from './recipes';
