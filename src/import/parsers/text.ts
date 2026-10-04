import type { RecipeDraft } from '../types';

export const INGREDIENTS_HEADER = /^(?:ingredients?|you(?:'|’)ll need|what you need)\s*:?\s*$/i;
const STEPS_HEADER = /^(?:steps?|instructions?|directions?|method|preparation)\s*:?\s*$/i;
const NOTES_HEADER = /^(?:notes?|tips?|cook(?:'|’)?s notes?|recipe notes?)\s*:?\s*$/i;
const TAGS_HEADER = /^tags?\s*:?\s*$/i;
const INLINE_TAGS = /^tags?\s*:\s*(.+)$/i;
const SOURCE_LINE = /^(?:source|from|original recipe|recipe from)\s*:\s*(https?:\/\/\S+)\s*$/i;
const BULLET = /^\s*(?:[-*•▪◦·‣–]\s*|\d+[.)]\s+|\d+[.)]$)/;
const NUMBERED = /^\s*(?:step\s*)?\d+\s*[.):]\s+/i;
const PAGE_NUMBER = /^(?:page\s*)?\d+(?:\s*(?:of|\/)\s*\d+)?$/i;
const SUBSTITUTION = /^substitution\s*:\s*(.+)$/i;
/** The app's own PDF export puts the step timer at the end: "… (40 min)", "(1 hr 30 min)", "(30 sec)". */
const TIMER_SUFFIX = /\s*\(((?:\d+\s*hr)?\s*(?:\d+\s*min)?\s*(?:\d+\s*sec)?)\)\s*$/i;
const SERVINGS = /^(?:servings|serves|yield|yields|makes)\s*:?\s*(\d+(?:\.\d+)?)/i;
const TIME_META = /^(?:prep|cook|cooking|total|active|inactive|bake|baking|chill|rest)(?:\s*time)?\s*:\s*\S/i;
const TIMED_STEPS = /^timed steps\s*:/i;

export const isSectionHeader = (line: string) =>
  INGREDIENTS_HEADER.test(line) || STEPS_HEADER.test(line) || NOTES_HEADER.test(line) || TAGS_HEADER.test(line);

/** Meta segments of a line like "Servings: 6 · Timed steps: 40 min" or "Prep: 10 min | Cook: 20 min". */
const metaSegments = (line: string) =>
  line
    .split(/\s+[·|•]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
export const isMetaLine = (line: string) =>
  metaSegments(line).every((s) => SERVINGS.test(s) || TIME_META.test(s) || TIMED_STEPS.test(s));

function parseTimer(label: string): number | undefined {
  const h = label.match(/(\d+)\s*hr/i);
  const m = label.match(/(\d+)\s*min/i);
  const s = label.match(/(\d+)\s*sec/i);
  if (!h && !m && !s) return undefined;
  const total = (h ? +h[1] * 3600 : 0) + (m ? +m[1] * 60 : 0) + (s ? +s[1] : 0);
  return total > 0 ? total : undefined;
}

const LIGATURES: Record<string, string> = { ﬀ: 'ff', ﬁ: 'fi', ﬂ: 'fl', ﬃ: 'ffi', ﬄ: 'ffl', ﬅ: 'st', ﬆ: 'st' };

/**
 * Plain-text recipe parser (shared text, dictation, and text pulled out of PDFs).
 * - first non-empty line = title; lines before the first section = description, except meta lines
 *   ("Servings: 4", "Serves 4", "Prep time: 10 min · Cook time: 20 min") — servings is parsed, times go to notes;
 * - sections: Ingredients / Steps (Instructions, Directions, Method) / Notes / Tags;
 * - numbered steps; un-numbered wrapped lines are joined back into one step; a trailing "(40 min)" becomes the step timer;
 * - "Substitution: …" under an ingredient becomes its substitution note; "Source: https://…" (or any URL) = sourceUrl.
 */
export function parseRecipeText(text: string): Partial<RecipeDraft> | undefined {
  const lines = text
    .replace(/[\uFB00-\uFB06]/g, (c) => LIGATURES[c] ?? c)
    .split(/\r?\n|\f/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => !PAGE_NUMBER.test(l));
  const titleIndex = lines.findIndex(Boolean);
  if (titleIndex < 0) return undefined;
  const title = lines[titleIndex].replace(/^#+\s*/, '');

  const description: string[] = [];
  const timeNotes: string[] = [];
  const ingredients: { text: string; substitutionNote?: string }[] = [];
  const steps: { text: string; durationSeconds?: number }[] = [];
  const notes: string[] = [];
  const tags: string[] = [];
  let servings: number | undefined;
  let sourceUrl: string | undefined;
  let section: 'intro' | 'ingredients' | 'steps' | 'notes' | 'tags' = 'intro';
  let numberedSteps = false;
  let stepOpen = false;

  const addTags = (s: string) =>
    tags.push(
      ...s
        .split(/[,;]/)
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean),
    );

  for (const line of lines.slice(titleIndex + 1)) {
    if (!line) {
      if (section === 'steps' && !numberedSteps) stepOpen = false;
      if (section === 'notes' && notes.length && notes[notes.length - 1] !== '') notes.push('');
      continue;
    }
    const src = line.match(SOURCE_LINE);
    if (src) {
      sourceUrl = src[1];
      continue;
    }
    if (INGREDIENTS_HEADER.test(line)) section = 'ingredients';
    else if (STEPS_HEADER.test(line)) section = 'steps';
    else if (NOTES_HEADER.test(line)) section = 'notes';
    else if (TAGS_HEADER.test(line)) section = 'tags';
    else if (INLINE_TAGS.test(line) && section !== 'notes') addTags(line.match(INLINE_TAGS)![1]);
    else if (section === 'intro' || (section !== 'notes' && isMetaLine(line))) {
      if (isMetaLine(line)) {
        for (const seg of metaSegments(line)) {
          const sv = seg.match(SERVINGS);
          if (sv && servings === undefined) servings = Number(sv[1]);
          else if (TIME_META.test(seg)) timeNotes.push(seg);
        }
      } else description.push(line);
    } else if (section === 'ingredients') {
      const sub = line.match(SUBSTITUTION);
      const prev = ingredients[ingredients.length - 1];
      if (sub && prev) prev.substitutionNote = sub[1].trim();
      else if (prev && !BULLET.test(line) && /(?:[,(\-–/]|\s(?:and|or|of|to))$/.test(prev.text))
        prev.text += ` ${line}`;
      else ingredients.push({ text: line.replace(BULLET, '') });
    } else if (section === 'steps') {
      const isNumbered = NUMBERED.test(line);
      if (isNumbered) numberedSteps = true;
      const prev = steps[steps.length - 1];
      const bulleted = !isNumbered && BULLET.test(line);
      const continues = prev && stepOpen && !isNumbered && !bulleted && (numberedSteps || !/[.!?)]$/.test(prev.text));
      if (continues) prev.text += ` ${line}`;
      else steps.push({ text: line.replace(NUMBERED, '').replace(BULLET, '') });
      stepOpen = true;
    } else if (section === 'notes') notes.push(line);
    else if (section === 'tags') addTags(line);
  }

  // Step timers written as a trailing "(40 min)".
  for (const st of steps) {
    const m = st.text.match(TIMER_SUFFIX);
    const seconds = m ? parseTimer(m[1]) : undefined;
    if (m && seconds) {
      st.text = st.text.slice(0, m.index).trim();
      st.durationSeconds = seconds;
    }
  }

  while (notes.length && notes[notes.length - 1] === '') notes.pop();
  const allNotes = [...timeNotes, ...(timeNotes.length && notes.length ? [''] : []), ...notes].join('\n').trim();
  sourceUrl ??= text.match(/https?:\/\/[^\s)>\]]+/)?.[0];
  return {
    title,
    description: description.join(' ').trim() || undefined,
    ingredients: ingredients.map((i) => (i.substitutionNote ? i : i.text)),
    steps: steps.map((st) => (st.durationSeconds ? st : st.text)),
    tags: [...new Set(tags)],
    servings: servings && servings > 0 && servings <= 1000 ? servings : undefined,
    notes: allNotes || undefined,
    sourceUrl,
  };
}
