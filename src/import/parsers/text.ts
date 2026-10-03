import type { RecipeDraft } from '../types';

const INGREDIENTS_HEADER = /^(ingredients?)\s*:?\s*$/i;
const STEPS_HEADER = /^(steps?|instructions?|directions?|method)\s*:?\s*$/i;
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s*/;

/**
 * Minimal plain-text parser: first non-empty line = title; lines under an "Ingredients" header
 * are ingredients, lines under "Steps"/"Instructions"/"Directions" are steps; a URL anywhere
 * becomes sourceUrl. TODO: smarter parsing (e.g. on-device or AI-assisted).
 */
export function parseRecipeText(text: string): Partial<RecipeDraft> | undefined {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const title = lines.find(Boolean);
  if (!title) return undefined;
  const ingredients: string[] = [];
  const steps: string[] = [];
  let section: 'none' | 'ingredients' | 'steps' = 'none';
  for (const line of lines.slice(lines.indexOf(title) + 1)) {
    if (!line) continue;
    if (INGREDIENTS_HEADER.test(line)) section = 'ingredients';
    else if (STEPS_HEADER.test(line)) section = 'steps';
    else if (section === 'ingredients') ingredients.push(line.replace(BULLET, ''));
    else if (section === 'steps') steps.push(line.replace(BULLET, ''));
  }
  const url = text.match(/https?:\/\/\S+/)?.[0];
  return { title: title.replace(/^#+\s*/, ''), ingredients, steps, sourceUrl: url };
}
