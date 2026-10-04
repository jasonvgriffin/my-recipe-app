/**
 * Split the text of a PDF into one chunk per recipe. A PDF exported by this app has one recipe per page (a long recipe
 * may run onto the next page); other PDFs may put several recipes on a page. Each "Ingredients" heading marks a recipe;
 * its title block is found by walking back from the heading past meta lines ("Servings: 4") to the title, never past a
 * page start, a blank line, a section heading or a "Source:" line.
 */
import { INGREDIENTS_HEADER, isMetaLine, isSectionHeader } from '../parsers/text';

const MAX_TITLE_BLOCK = 6;

export function splitRecipeTexts(pages: string[]): string[] {
  const lines: string[] = [];
  const pageStarts = new Set<number>();
  for (const page of pages) {
    pageStarts.add(lines.length);
    lines.push(...page.split('\n').map((l) => l.trim()));
    lines.push('');
  }
  const headers = lines.map((l, i) => (INGREDIENTS_HEADER.test(l) ? i : -1)).filter((i) => i >= 0);
  const whole = lines.join('\n').trim();
  if (headers.length <= 1) return whole ? [whole] : [];

  const starts = [0];
  for (let k = 1; k < headers.length; k++) {
    const lo = headers[k - 1] + 1;
    let i = headers[k] - 1;
    // Skip blanks and meta lines directly above the heading.
    while (i >= lo && (!lines[i] || isMetaLine(lines[i]))) {
      if (pageStarts.has(i)) break;
      i--;
    }
    let start = headers[k];
    let taken = 0;
    while (i >= lo && lines[i] && taken < MAX_TITLE_BLOCK) {
      if (isSectionHeader(lines[i]) || /^source\s*:/i.test(lines[i]) || /^\s*\d+\s*[.)]\s/.test(lines[i])) break;
      start = i;
      taken++;
      if (pageStarts.has(i)) break;
      i--;
    }
    starts.push(start);
  }
  return starts
    .map((s, k) =>
      lines
        .slice(s, k + 1 < starts.length ? starts[k + 1] : lines.length)
        .join('\n')
        .trim(),
    )
    .filter(Boolean);
}
