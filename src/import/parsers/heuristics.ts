import type { RecipeDraft } from '../types';
import { isHttpUrl, parseUrl } from '../url';
import { findAll, hasClass, parseHtml, textContent, type HtmlEl } from '../html';

/**
 * Fallback when a page has no usable schema.org Recipe JSON-LD (spec #1).
 * Order: microdata → WP Recipe Maker → Tasty Recipes → heading + list heuristics.
 * Returns undefined when there is no title plus at least one ingredient or step.
 */
export function extractRecipeHeuristically(html: string, sourceUrl?: string): Partial<RecipeDraft> | undefined {
  if (!html.trim()) return undefined;
  const root = parseHtml(html);
  return (
    fromMicrodata(root, sourceUrl) ??
    fromWprm(root, sourceUrl) ??
    fromTasty(root, sourceUrl) ??
    fromHeadings(root, sourceUrl)
  );
}

const ING_HEADING = /^(ingredients?)\s*:?\s*$/i;
const STEP_HEADING = /^(steps?|instructions?|directions?|method|preparation)\s*:?\s*$/i;
// Stop at a nutrition panel too: imports never keep nutrition (recipe app, not a nutrition app).
const STOP_HEADING = /^(notes?|nutrition|you may also like|related( recipes)?|comments?|reviews?)$/i;

function usable(draft: Partial<RecipeDraft> | undefined): Partial<RecipeDraft> | undefined {
  if (!draft?.title?.trim()) return undefined;
  const ingredients = (draft.ingredients ?? [])
    .map((i) => (typeof i === 'string' ? i.trim() : i))
    .filter((i) => (typeof i === 'string' ? i : i.text).trim());
  const steps = (draft.steps ?? [])
    .map((s) => (typeof s === 'string' ? s.trim() : s))
    .filter((s) => (typeof s === 'string' ? s : s.text).trim());
  if (ingredients.length === 0 && steps.length === 0) return undefined;
  return { ...draft, title: draft.title.trim(), ingredients, steps };
}

function parseServings(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = raw.match(/\d+/);
  const n = m ? parseInt(m[0], 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Turn a page-relative image into an absolute http(s) URL when the page URL is known. */
function resolveResourceUrl(src: string | undefined, pageUrl?: string): string | undefined {
  if (!src) return undefined;
  const t = src.trim();
  if (!t || t.startsWith('data:')) return undefined;
  if (isHttpUrl(t)) return t;
  const page = pageUrl ? parseUrl(pageUrl) : undefined;
  if (!page) return undefined;
  if (t.startsWith('//')) {
    const abs = `${page.protocol}:${t}`;
    return isHttpUrl(abs) ? abs : undefined;
  }
  if (t.startsWith('/')) {
    const abs = `${page.protocol}://${page.host}${t}`;
    return isHttpUrl(abs) ? abs : undefined;
  }
  return undefined;
}

function imageFrom(el: HtmlEl | undefined, pageUrl?: string): string | undefined {
  if (!el) return undefined;
  const img = el.tag === 'img' ? el : findAll(el, (e) => e.tag === 'img')[0];
  const raw = img?.attrs.src || img?.attrs['data-src'] || img?.attrs['data-lazy-src'] || el.attrs.content || el.attrs.src;
  return resolveResourceUrl(raw, pageUrl);
}

function itemProps(el: HtmlEl): string[] {
  return (el.attrs.itemprop ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function collectItemProps(scope: HtmlEl): Map<string, HtmlEl[]> {
  const map = new Map<string, HtmlEl[]>();
  const walk = (el: HtmlEl, foreign: boolean) => {
    const type = el.attrs.itemtype ?? '';
    const nestedOther =
      el !== scope &&
      !!type &&
      !/schema\.org\/(Recipe|HowToStep|HowToSection|HowToDirection)\b/i.test(type);
    const nextForeign = foreign || nestedOther;
    if (!nextForeign) {
      for (const prop of itemProps(el)) {
        const list = map.get(prop) ?? [];
        list.push(el);
        map.set(prop, list);
      }
    }
    for (const child of el.children) if (typeof child !== 'string') walk(child, nextForeign);
  };
  walk(scope, false);
  return map;
}

function propText(el: HtmlEl): string {
  if (el.tag === 'meta') return (el.attrs.content ?? '').trim();
  if (el.attrs.datetime && !textContent(el)) return el.attrs.datetime.trim();
  const text = textContent(el);
  if (!text && el.attrs.content) return el.attrs.content.trim();
  return text;
}

function fromMicrodata(root: HtmlEl, sourceUrl?: string): Partial<RecipeDraft> | undefined {
  const scope = findAll(root, (e) => /schema\.org\/Recipe\b/i.test(e.attrs.itemtype ?? ''))[0];
  if (!scope) return undefined;
  const props = collectItemProps(scope);
  const title = (props.get('name') ?? []).map(propText).find(Boolean);
  const ingredients = (props.get('recipeingredient') ?? []).map(propText).filter(Boolean);
  const instructionNodes = [...(props.get('recipeinstructions') ?? []), ...(props.get('instructions') ?? [])];
  const steps: string[] = [];
  for (const node of instructionNodes) {
    const texts = findAll(node, (e) => itemProps(e).includes('text'));
    if (texts.length) steps.push(...texts.map(propText).filter(Boolean));
    else steps.push(...propText(node).split(/\n+/).map((s) => s.trim()).filter(Boolean));
  }
  if (steps.length === 0) {
    for (const step of findAll(scope, (e) => /schema\.org\/HowToStep\b/i.test(e.attrs.itemtype ?? ''))) {
      const textEl = findAll(step, (e) => itemProps(e).includes('text'))[0];
      const text = (textEl ? propText(textEl) : propText(step)).trim();
      if (text) steps.push(text);
    }
  }
  const description = (props.get('description') ?? []).map(propText).find(Boolean);
  const yieldText = (props.get('recipeyield') ?? []).map(propText).find(Boolean);
  const imageEl = (props.get('image') ?? [])[0];
  const keywords = (props.get('keywords') ?? [])
    .flatMap((el) => propText(el).split(','))
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
  const categories = (props.get('recipecategory') ?? []).map(propText).filter(Boolean);
  return usable({
    title,
    description,
    ingredients,
    steps,
    tags: keywords,
    categories,
    servings: parseServings(yieldText),
    photoUrl: imageEl ? imageFrom(imageEl, sourceUrl) ?? resolveResourceUrl(imageEl.attrs.content || imageEl.attrs.href, sourceUrl) : undefined,
    sourceUrl,
  });
}

function textOfClass(root: HtmlEl, className: string): string {
  return findAll(root, (e) => hasClass(e, className))
    .map(textContent)
    .filter(Boolean)
    .join(' ')
    .trim();
}

function fromWprm(root: HtmlEl, sourceUrl?: string): Partial<RecipeDraft> | undefined {
  const name = findAll(root, (e) => hasClass(e, 'wprm-recipe-name'))[0];
  if (!name) return undefined;
  const ingredients = findAll(root, (e) => hasClass(e, 'wprm-recipe-ingredient'))
    .map((row) => {
      const amount = textOfClass(row, 'wprm-recipe-ingredient-amount');
      const unit = textOfClass(row, 'wprm-recipe-ingredient-unit');
      const ingredientName = textOfClass(row, 'wprm-recipe-ingredient-name');
      const notes = textOfClass(row, 'wprm-recipe-ingredient-notes');
      if (amount || unit || ingredientName) return [amount, unit, ingredientName, notes].filter(Boolean).join(' ');
      return textContent(row);
    })
    .filter(Boolean);
  const steps = findAll(root, (e) => hasClass(e, 'wprm-recipe-instruction-text')).map(textContent).filter(Boolean);
  const summary = findAll(root, (e) => hasClass(e, 'wprm-recipe-summary'))[0];
  const servingsEl = findAll(
    root,
    (e) => hasClass(e, 'wprm-recipe-servings') || hasClass(e, 'wprm-recipe-servings-with-unit'),
  )[0];
  const imageWrap = findAll(root, (e) => hasClass(e, 'wprm-recipe-image'))[0];
  return usable({
    title: textContent(name),
    description: summary ? textContent(summary) : undefined,
    ingredients,
    steps,
    servings: parseServings(servingsEl ? textContent(servingsEl) : undefined),
    photoUrl: imageFrom(imageWrap, sourceUrl),
    sourceUrl,
  });
}

function fromTasty(root: HtmlEl, sourceUrl?: string): Partial<RecipeDraft> | undefined {
  const titleEl = findAll(
    root,
    (e) => hasClass(e, 'tasty-recipes-title') || hasClass(e, 'tasty-recipes-entry-title'),
  )[0];
  if (!titleEl) return undefined;
  const ingRoot =
    findAll(root, (e) => hasClass(e, 'tasty-recipes-ingredients-body'))[0] ??
    findAll(root, (e) => hasClass(e, 'tasty-recipes-ingredients'))[0];
  const stepRoot =
    findAll(root, (e) => hasClass(e, 'tasty-recipes-instructions-body'))[0] ??
    findAll(root, (e) => hasClass(e, 'tasty-recipes-instructions'))[0];
  const ingredients = ingRoot ? findAll(ingRoot, (e) => e.tag === 'li').map(textContent).filter(Boolean) : [];
  const steps = stepRoot ? findAll(stepRoot, (e) => e.tag === 'li').map(textContent).filter(Boolean) : [];
  const desc = findAll(root, (e) => hasClass(e, 'tasty-recipes-description'))[0];
  const yieldEl = findAll(root, (e) => hasClass(e, 'tasty-recipes-yield') || hasClass(e, 'tasty-recipes-yield-scale'))[0];
  const imageWrap = findAll(root, (e) => hasClass(e, 'tasty-recipes-image'))[0];
  return usable({
    title: textContent(titleEl),
    description: desc ? textContent(desc) : undefined,
    ingredients,
    steps,
    servings: parseServings(yieldEl ? textContent(yieldEl) : undefined),
    photoUrl: imageFrom(imageWrap, sourceUrl),
    sourceUrl,
  });
}

function fromHeadings(root: HtmlEl, sourceUrl?: string): Partial<RecipeDraft> | undefined {
  const blocks = collectBlocks(root);
  const h1 = blocks.find((b) => b.kind === 'h1')?.text;
  const titleTag = findAll(root, (e) => e.tag === 'title')[0];
  const title = h1 || (titleTag ? textContent(titleTag) : undefined);
  let mode: 'none' | 'ing' | 'step' | 'stop' = 'none';
  const ingredients: string[] = [];
  const steps: string[] = [];
  const ingParagraphs: string[] = [];
  const stepParagraphs: string[] = [];
  for (const block of blocks) {
    const short = block.text.length < 60;
    if (short && ING_HEADING.test(block.text)) {
      mode = 'ing';
      continue;
    }
    if (short && STEP_HEADING.test(block.text)) {
      mode = 'step';
      continue;
    }
    if (short && STOP_HEADING.test(block.text) && block.kind !== 'li') {
      mode = 'stop';
      continue;
    }
    if (mode === 'ing' && block.kind === 'li') ingredients.push(block.text);
    else if (mode === 'ing' && block.kind === 'p') ingParagraphs.push(block.text);
    else if (mode === 'step' && block.kind === 'li') steps.push(block.text);
    else if (mode === 'step' && block.kind === 'p') stepParagraphs.push(block.text);
  }
  return usable({
    title,
    ingredients: ingredients.length ? ingredients : ingParagraphs,
    steps: steps.length ? steps : stepParagraphs,
    sourceUrl,
  });
}

interface Block {
  kind: 'h1' | 'heading' | 'li' | 'p';
  text: string;
}

function collectBlocks(root: HtmlEl): Block[] {
  const blocks: Block[] = [];
  const walk = (el: HtmlEl) => {
    if (/^h[1-6]$/.test(el.tag)) {
      const text = textContent(el);
      if (text) blocks.push({ kind: el.tag === 'h1' ? 'h1' : 'heading', text });
      return;
    }
    if (el.tag === 'li') {
      const text = textContent(el);
      if (text) blocks.push({ kind: 'li', text });
      return;
    }
    if (el.tag === 'p') {
      const text = textContent(el);
      if (text) blocks.push({ kind: 'p', text });
      return;
    }
    for (const child of el.children) if (typeof child !== 'string') walk(child);
  };
  walk(root);
  return blocks;
}
