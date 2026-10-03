import type { RecipeDraft } from '../types';

/**
 * Extract a schema.org `Recipe` from JSON-LD <script> blocks in an HTML page.
 * Returns an unvalidated draft (importRecipe validates it) or undefined if none found.
 */
export function extractJsonLdRecipe(html: string, sourceUrl?: string): Partial<RecipeDraft> | undefined {
  const scripts = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const recipe = findRecipeNode(data);
    if (recipe) return toDraft(recipe, sourceUrl);
  }
  return undefined;
}

type Node = Record<string, unknown>;

function isRecipeType(t: unknown): boolean {
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
}

function findRecipeNode(data: unknown): Node | undefined {
  if (Array.isArray(data)) {
    for (const d of data) {
      const found = findRecipeNode(d);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof data !== 'object' || data === null) return undefined;
  const node = data as Node;
  if (isRecipeType(node['@type'])) return node;
  if (node['@graph']) return findRecipeNode(node['@graph']);
  return undefined;
}

export const decodeHtml = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();

function instructions(value: unknown): string[] {
  if (typeof value === 'string') return value.split(/\r?\n/).map(decodeHtml).filter(Boolean);
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((v) => {
      if (typeof v === 'string') return [decodeHtml(v)];
      if (typeof v === 'object' && v !== null) {
        const n = v as Node;
        if (n['@type'] === 'HowToSection') return instructions(n.itemListElement);
        if (typeof n.text === 'string') return [decodeHtml(n.text)];
      }
      return [];
    })
    .filter(Boolean);
}

function image(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return image(value[0]);
  if (typeof value === 'object' && value !== null && typeof (value as Node).url === 'string')
    return (value as Node).url as string;
  return undefined;
}

function toDraft(r: Node, sourceUrl?: string): Partial<RecipeDraft> {
  const yieldRaw = Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield;
  const servings = parseInt(String(yieldRaw ?? ''), 10);
  const keywords = typeof r.keywords === 'string' ? r.keywords.split(',') : Array.isArray(r.keywords) ? r.keywords : [];
  const category =
    typeof r.recipeCategory === 'string' ? [r.recipeCategory] : Array.isArray(r.recipeCategory) ? r.recipeCategory : [];
  return {
    title: typeof r.name === 'string' ? decodeHtml(r.name) : undefined,
    description: typeof r.description === 'string' ? decodeHtml(r.description) : undefined,
    ingredients: Array.isArray(r.recipeIngredient)
      ? r.recipeIngredient.filter((i): i is string => typeof i === 'string').map(decodeHtml)
      : undefined,
    steps: instructions(r.recipeInstructions),
    tags: keywords.map((k) => String(k).trim().toLowerCase()).filter(Boolean),
    categories: category.map((c) => String(c).trim()).filter(Boolean),
    servings: Number.isFinite(servings) && servings > 0 ? servings : undefined,
    photoUrl: image(r.image),
    sourceUrl,
  };
}
