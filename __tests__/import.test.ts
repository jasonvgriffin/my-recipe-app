import {
  importPathFromIncomingUrl,
  importRecipe,
  normalizeSourceUrl,
  parseImportDeepLink,
  sharedPayloadToText,
  shareTextToImportInput,
  type ImportDeps,
} from '@/import';
import { extractJsonLdRecipe } from '@/import/parsers/json-ld';
import { isHttpUrl } from '@/import/url';
import { createRecipeStore, type KeyValueStore } from '@/storage/recipes';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}

const PAGE_URL = 'https://www.example.com/keto-bread/?utm_source=x#jump';
const PAGE = `<html><head><script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebPage', name: 'x' },
    {
      '@type': ['Recipe'],
      name: 'Keto Bread &amp; Butter',
      recipeYield: ['8 servings'],
      recipeIngredient: ['2 cups almond flour', '2 tbsp allulose'],
      recipeInstructions: [
        { '@type': 'HowToSection', itemListElement: [{ '@type': 'HowToStep', text: 'Mix.' }] },
        { '@type': 'HowToStep', text: '<p>Bake.</p>' },
      ],
      keywords: 'Bread, Low-Carb',
      nutrition: {
        '@type': 'NutritionInformation',
        calories: '180 kcal',
        carbohydrateContent: '6 g',
        fiberContent: '3 g',
        proteinContent: '7g',
      },
      recipeCategory: 'Breads',
      image: [{ url: 'https://example.com/bread.jpg' }],
    },
  ],
})}</script></head></html>`;

function deps(store = createRecipeStore(memoryStore()), html = PAGE): ImportDeps & { store: typeof store } {
  return { store, fetchHtml: jest.fn(async () => html), now: () => new Date('2026-10-02T12:00:00Z') };
}

describe('importRecipe — structured (future MCP / "Hey AI, send this recipe")', () => {
  it('validates, normalizes and saves a structured draft', async () => {
    const d = deps();
    const result = await importRecipe(
      {
        kind: 'structured',
        recipe: {
          title: '  Allulose   Lemon Bars ',
          ingredients: ['1 cup almond flour', { text: '1/2 cup allulose' }],
          steps: ['Bake 20 min'],
          tags: ['Dessert'],
          categories: ['Desserts'],
          carbsPerServing: 3,
          servings: 9,
        },
        source: { channel: 'mcp', label: 'Grok' },
      },
      {},
      d,
    );
    expect(result).toMatchObject({ ok: true, status: 'created', warnings: [] });
    if (!result.ok) throw new Error('expected ok');
    expect(result.recipe).toMatchObject({
      title: 'Allulose Lemon Bars',
      ingredients: [{ text: '1 cup almond flour' }, { text: '1/2 cup allulose' }],
      tags: ['dessert'],
      servings: 9,
      nutrition: { netCarbsG: 3, source: 'imported' },
    });
    expect(result.recipe.ingredients[1]).toMatchObject({ quantity: 0.5, unit: 'cup', name: 'allulose' });
    const [cat] = await d.store.listCategories();
    expect(cat.name).toBe('Desserts');
    expect(result.recipe.categoryIds).toEqual([cat.id]);
    expect(await d.store.get(result.recipe.id)).toBeDefined();
  });

  it('rejects invalid drafts and monk fruit', async () => {
    const d = deps();
    const bad = await importRecipe({ kind: 'structured', recipe: { title: '', ingredients: [] } }, {}, d);
    expect(bad).toMatchObject({ ok: false, code: 'invalid_input' });
    const monk = await importRecipe(
      { kind: 'structured', recipe: { title: 'Cookies', ingredients: ['1/2 cup monk fruit sweetener'] } },
      {},
      d,
    );
    expect(monk).toMatchObject({ ok: false, code: 'forbidden_ingredient' });
    expect(await d.store.list()).toHaveLength(0);
  });

  it('warns (not fails) on unknown carbs/servings and never invents carbs', async () => {
    const result = await importRecipe(
      { kind: 'structured', recipe: { title: 'Eggs', steps: ['Scramble'] } },
      {},
      deps(),
    );
    if (!result.ok) throw new Error('expected ok');
    expect(result.recipe.nutrition.netCarbsG).toBeUndefined();
    expect(result.warnings.join(' ')).toMatch(/Net carbs per serving unknown/);
  });
});

describe('importRecipe — url (link import, spec #1/#5)', () => {
  it('fetches, parses JSON-LD, keeps the source link, and dedupes by normalized URL', async () => {
    const d = deps();
    const first = await importRecipe({ kind: 'url', url: PAGE_URL }, {}, d);
    if (!first.ok) throw new Error(first.errors.join());
    expect(first.recipe).toMatchObject({
      title: 'Keto Bread & Butter',
      steps: [{ text: 'Mix.' }, { text: 'Bake.' }],
      servings: 8,
      sourceUrl: PAGE_URL,
      photoUri: 'https://example.com/bread.jpg',
      nutrition: { calories: 180, carbsG: 6, fiberG: 3, proteinG: 7, netCarbsG: 3, source: 'imported' },
    });
    expect(first.warnings).toContain('Net carbs computed as total carbs minus fiber.');

    const again = await importRecipe({ kind: 'url', url: 'http://example.com/keto-bread' }, {}, d);
    expect(again).toMatchObject({ ok: true, status: 'duplicate' });
    if (!again.ok) throw new Error();
    expect(again.recipe.id).toBe(first.recipe.id);

    const updated = await importRecipe({ kind: 'url', url: PAGE_URL }, { onDuplicate: 'update' }, d);
    expect(updated).toMatchObject({ ok: true, status: 'updated' });
    expect(await d.store.list()).toHaveLength(1);
  });

  it('falls back to microdata when the page has no usable JSON-LD', async () => {
    const html = `<html><body>
      <div itemscope itemtype="https://schema.org/Recipe">
        <h1 itemprop="name">Skillet Eggs &amp; Greens</h1>
        <span itemprop="recipeYield">2 servings</span>
        <span itemprop="recipeIngredient">4 eggs</span>
        <span itemprop="recipeIngredient">1 tbsp butter</span>
        <div itemprop="recipeInstructions">
          <div itemscope itemtype="https://schema.org/HowToStep"><span itemprop="text">Melt the butter.</span></div>
          <div itemscope itemtype="https://schema.org/HowToStep"><span itemprop="text">Cook 4 minutes.</span></div>
        </div>
        <img itemprop="image" src="/eggs.jpg" />
      </div>
    </body></html>`;
    const result = await importRecipe({ kind: 'url', url: 'https://example.com/eggs' }, { dryRun: true }, deps(undefined, html));
    expect(result).toMatchObject({
      ok: true,
      recipe: {
        title: 'Skillet Eggs & Greens',
        servings: 2,
        ingredients: [{ text: '4 eggs' }, { text: '1 tbsp butter' }],
        steps: [{ text: 'Melt the butter.' }, { text: 'Cook 4 minutes.' }],
        photoUri: 'https://example.com/eggs.jpg',
        sourceUrl: 'https://example.com/eggs',
      },
    });
  });

  it('keeps JSON-LD when it is usable, even if the page also has a different heading', async () => {
    const html = `${PAGE}<h1>Not the recipe</h1><h2>Ingredients</h2><ul><li>999 eggs</li></ul><h2>Steps</h2><ul><li>Ignore</li></ul>`;
    const result = await importRecipe({ kind: 'url', url: PAGE_URL }, { dryRun: true }, deps(undefined, html));
    if (!result.ok) throw new Error(result.errors.join());
    expect(result.recipe.title).toBe('Keto Bread & Butter');
    expect(result.recipe.ingredients.map((i) => i.text)).toEqual(['2 cups almond flour', '2 tbsp allulose']);
  });

  it('reports fetch failures and pages without a recipe', async () => {
    const failing: ImportDeps = { ...deps(), fetchHtml: async () => Promise.reject(new Error('offline')) };
    expect(await importRecipe({ kind: 'url', url: 'https://x.com/r' }, {}, failing)).toMatchObject({
      ok: false,
      code: 'fetch_failed',
    });
    expect(
      await importRecipe({ kind: 'url', url: 'https://x.com/r' }, {}, deps(undefined, '<html></html>')),
    ).toMatchObject({
      ok: false,
      code: 'no_recipe_found',
    });
    expect(await importRecipe({ kind: 'url', url: 'not a url' }, {}, deps())).toMatchObject({
      ok: false,
      code: 'invalid_input',
    });
  });
});

describe('importRecipe — text', () => {
  it('parses a simple shared text recipe', async () => {
    const text = 'Cauliflower Mash\nIngredients:\n- 1 head cauliflower\n- 2 tbsp butter\nSteps:\n1. Steam\n2. Mash';
    const result = await importRecipe({ kind: 'text', text }, { dryRun: true }, deps());
    expect(result).toMatchObject({
      ok: true,
      recipe: {
        title: 'Cauliflower Mash',
        ingredients: [{ text: '1 head cauliflower' }, { text: '2 tbsp butter' }],
        steps: [{ text: 'Steam' }, { text: 'Mash' }],
      },
    });
  });
});

describe('entry-point adapters', () => {
  it('normalizes source URLs for dedupe', () => {
    expect(normalizeSourceUrl('HTTPS://WWW.Example.com/a/?b=2&utm_medium=x&a=1#top')).toBe(
      'https://example.com/a?a=1&b=2',
    );
    expect(normalizeSourceUrl('ftp://example.com')).toBeUndefined();
  });

  it('parses deep links and share text', () => {
    expect(parseImportDeepLink('myrecipeapp://import?url=https%3A%2F%2Fexample.com%2Fr')).toEqual({
      kind: 'url',
      url: 'https://example.com/r',
      source: { channel: 'deep-link' },
    });
    expect(parseImportDeepLink('myrecipeapp://other')).toBeUndefined();
    expect(shareTextToImportInput(' https://example.com/r ')).toMatchObject({ kind: 'url' });
    expect(shareTextToImportInput('My recipe\nIngredients:\n- eggs')).toMatchObject({ kind: 'text' });
    expect(shareTextToImportInput('Keto bread\nhttps://example.com/bread')).toMatchObject({
      kind: 'url',
      url: 'https://example.com/bread',
      source: { channel: 'share-intent', label: 'Keto bread' },
    });
    expect(sharedPayloadToText([{ shareType: 'url', value: ' https://example.com/r ' }])).toBe('https://example.com/r');
    expect(sharedPayloadToText([{ shareType: 'image', value: 'file://x' }])).toBeUndefined();
    expect(importPathFromIncomingUrl('myrecipeapp://expo-sharing')).toBe('/import?incoming=1');
    expect(importPathFromIncomingUrl('myrecipeapp://import?url=https%3A%2F%2Fexample.com')).toBe(
      'myrecipeapp://import?url=https%3A%2F%2Fexample.com',
    );
  });

  it('extractJsonLdRecipe ignores bad JSON', () => {
    expect(extractJsonLdRecipe('<script type="application/ld+json">{bad</script>')).toBeUndefined();
  });
});

describe('url helpers (no reliance on RN URL polyfill)', () => {
  it.each([
    ['https://example.com/a', true],
    ['http://localhost:8080/x', true],
    ['not a url', false],
    ['https://exa mple.com', false],
    ['myrecipeapp://import', false],
    ['https://nodot', false],
  ])('isHttpUrl(%s) = %s', (u, ok) => expect(isHttpUrl(u)).toBe(ok));
});
