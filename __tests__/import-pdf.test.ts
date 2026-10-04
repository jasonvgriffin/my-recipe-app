/**
 * Import PDF (v1.0.6): on-device PDF text extraction → one recipe per chunk → the normal import pipeline.
 * Fixtures app-export-*.pdf were printed by Chrome (Skia, the engine Android's WebView uses for our PDF export)
 * from `recipesPdfHtml`, so they are what the app's own "Share Recipes" PDF looks like.
 */
import { imageOnlyPdf, simplePdf } from '../test-helpers/simple-pdf';
import type { ImportDeps } from '@/import';
import { extractPdfText, importPdfCandidates, readRecipesFromPdf, splitRecipeTexts } from '@/import/pdf';
import { inflate, inflateRaw } from '@/import/pdf/inflate';
import { sharedPdfUri } from '@/import';
import { parseRecipeText } from '@/import/parsers/text';
import { ADD_MENU_ITEMS, addMenuHref } from '@/lib/add-menu';
import { createRecipeStore, type KeyValueStore } from '@/storage/recipes';

const fs = jest.requireActual('fs');
const zlib = jest.requireActual('zlib');
const fixture = (name: string) => new Uint8Array(fs.readFileSync(`__tests__/fixtures/pdf/${name}.pdf`));

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => void data.set(k, v),
    removeItem: async (k) => void data.delete(k),
  };
}
function deps(canUse?: ImportDeps['canUse']) {
  const store = createRecipeStore(memoryStore());
  return { store, canUse, fetchHtml: jest.fn(async () => ''), now: () => new Date('2026-10-04T12:00:00Z') };
}

describe('inflate (pure TS, no native module)', () => {
  it('matches zlib for stored, fixed and dynamic Huffman blocks', () => {
    const big = new TextEncoder().encode(
      Array.from({ length: 20000 }, (_, i) => `line ${i % 97} allulose ${i * 7}\n`).join(''),
    );
    const same = (a: Uint8Array) => a.length === big.length && a.every((v, i) => v === big[i]);
    for (const level of [0, 1, 6, 9]) {
      expect(same(inflate(new Uint8Array(zlib.deflateSync(big, { level }))))).toBe(true);
      expect(same(inflateRaw(new Uint8Array(zlib.deflateRawSync(big, { level }))))).toBe(true);
    }
  });
});

describe('PDF exported by this app (round trip)', () => {
  it('reads one recipe with description, servings, timers, notes, tags and source', async () => {
    const d = deps();
    const result = await readRecipesFromPdf(fixture('app-export-one'), d);
    if (!result.ok) throw new Error(result.message);
    expect(result.candidates).toHaveLength(1);
    const r = result.candidates[0].result.recipe;
    expect(r).toMatchObject({
      title: 'Lemon Herb Chicken Thighs',
      description: 'Crispy-skinned sheet-pan chicken with green beans.',
      servings: 6,
      tags: ['dinner', 'diabetic-friendly', 'sheet-pan'],
      notes: 'Rest 5 minutes before serving.\nGreat with cauliflower rice.',
      sourceUrl: 'https://example.com/lemon-chicken',
      categoryIds: [],
    });
    expect(r.ingredients.map((i) => i.text)).toEqual([
      '6 bone-in, skin-on chicken thighs',
      '2 tbsp olive oil',
      '1 lemon, zested and juiced',
      '3 cloves garlic, minced',
      '1 tsp dried thyme',
      '1 lb green beans, trimmed',
      'Salt and pepper to taste',
    ]);
    expect(r.steps).toHaveLength(4);
    expect(r.steps[0].text).toBe('Heat oven to 425°F (220°C).');
    expect(r.steps[3]).toMatchObject({
      text: 'Roast 35–40 minutes until the chicken reaches 175°F (80°C) and the skin is crisp.',
      durationSeconds: 2400,
    });
    // Dry run: nothing saved yet.
    expect(await d.store.list()).toHaveLength(0);
  });

  it('finds every recipe in a multi-recipe export and imports only the chosen ones into several categories', async () => {
    const d = deps();
    const result = await readRecipesFromPdf(fixture('app-export-two'), d);
    if (!result.ok) throw new Error(result.message);
    expect(result.candidates.map((c) => c.result.recipe.title)).toEqual([
      'Lemon Herb Chicken Thighs',
      'Allulose Vanilla Cheesecake Mousse',
    ]);
    const mousse = result.candidates[1].result.recipe;
    expect(mousse.ingredients.map((i) => i.text)).toContain('⅓ cup powdered allulose');
    expect(mousse.steps[3]).toMatchObject({
      text: 'Spoon into 6 cups and chill at least 1 hour.',
      durationSeconds: 3600,
    });
    expect(mousse.sourceUrl).toBeUndefined();

    const dessert = await d.store.addCategory('Dessert');
    const party = await d.store.addCategory('Party');
    const saved = await importPdfCandidates([result.candidates[1]], [dessert.id, party.id], d);
    expect(saved).toHaveLength(1);
    const list = await d.store.list();
    expect(list.map((r) => r.title)).toEqual(['Allulose Vanilla Cheesecake Mousse']);
    expect(list[0].categoryIds).toEqual([dessert.id, party.id]);

    // Once the chicken (which has a source link) is saved, reading the PDF again marks it "Already in your recipes".
    await importPdfCandidates([result.candidates[0]], [], d);
    const again = await readRecipesFromPdf(fixture('app-export-two'), d);
    if (!again.ok) throw new Error(again.message);
    expect(again.candidates[0].result.status).toBe('duplicate');
  });
});

describe('other PDFs', () => {
  const recipeA = [
    'Garlic Butter Shrimp',
    'Serves 4',
    'Prep time: 10 min | Cook time: 8 min',
    '',
    'Ingredients:',
    '• 1 lb shrimp, peeled',
    '• 3 tbsp butter',
    '• 4 cloves garlic, minced',
    '',
    'Directions:',
    'Melt the butter in a large skillet over medium',
    'heat and add the garlic.',
    'Add the shrimp and cook until pink, about 3',
    'minutes per side.',
    '',
    'Notes:',
    'Don’t overcook the shrimp.',
  ];
  const recipeB = [
    'Cucumber Salad',
    '',
    'Ingredients',
    '2 cucumbers, sliced',
    '1 tbsp rice vinegar',
    '',
    'Steps',
    '1. Toss everything together.',
    '2. Chill 30 minutes.',
  ];

  it('reads a simple Helvetica / WinAnsi / Flate PDF (wrapped steps joined, times kept in notes)', async () => {
    for (const options of [{}, { compress: false }, { kerned: true }, { differences: true }, { form: true }]) {
      const result = await readRecipesFromPdf(simplePdf([recipeA], options), deps());
      if (!result.ok) throw new Error(`${JSON.stringify(options)}: ${result.message}`);
      const r = result.candidates[0].result.recipe;
      expect(r.title).toBe('Garlic Butter Shrimp');
      expect(r.servings).toBe(4);
      expect(r.ingredients.map((i) => i.text)).toEqual([
        '1 lb shrimp, peeled',
        '3 tbsp butter',
        '4 cloves garlic, minced',
      ]);
      expect(r.steps.map((s) => s.text)).toEqual([
        'Melt the butter in a large skillet over medium heat and add the garlic.',
        'Add the shrimp and cook until pink, about 3 minutes per side.',
      ]);
      expect(r.notes).toBe('Prep time: 10 min\nCook time: 8 min\n\nDon’t overcook the shrimp.');
    }
  });

  it('reads a LibreOffice PDF (embedded TrueType subset with a ToUnicode map)', async () => {
    const result = await readRecipesFromPdf(fixture('libreoffice-pancakes'), deps());
    if (!result.ok) throw new Error(result.message);
    expect(result.candidates[0].result.recipe).toMatchObject({
      title: 'Keto Pancakes',
      description: 'Fluffy almond-flour pancakes.',
      servings: 4,
      ingredients: [{ text: '1 cup almond flour' }, { text: '2 eggs' }, { text: '1 tbsp allulose' }],
      steps: [
        { text: 'Whisk everything together until smooth and let it rest for five minutes before cooking.' },
        { text: 'Cook on a hot griddle.' },
      ],
    });
  });

  it('splits several recipes on one page and across pages', async () => {
    const onePage = await readRecipesFromPdf(simplePdf([[...recipeA, '', '', ...recipeB]]), deps());
    if (!onePage.ok) throw new Error(onePage.message);
    expect(onePage.candidates.map((c) => c.result.recipe.title)).toEqual(['Garlic Butter Shrimp', 'Cucumber Salad']);
    expect(onePage.candidates[1].result.recipe.steps.map((s) => s.text)).toEqual([
      'Toss everything together.',
      'Chill 30 minutes.',
    ]);
    const twoPages = await readRecipesFromPdf(simplePdf([recipeA, recipeB]), deps());
    expect(twoPages.ok && twoPages.candidates.map((c) => c.result.recipe.title)).toEqual([
      'Garlic Butter Shrimp',
      'Cucumber Salad',
    ]);
  });

  it('a long recipe that runs onto the next page stays one recipe', async () => {
    const result = await readRecipesFromPdf(simplePdf([recipeA.slice(0, 12), ['2', ...recipeA.slice(12)]]), deps());
    if (!result.ok) throw new Error(result.message);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].result.recipe.steps).toHaveLength(2);
  });

  it('explains scans / image-only PDFs, text without a recipe, and non-PDF files', async () => {
    expect(extractPdfText(imageOnlyPdf()).hasText).toBe(false);
    expect(await readRecipesFromPdf(imageOnlyPdf(), deps())).toMatchObject({
      ok: false,
      reason: 'no_text',
      message: expect.stringMatching(/^Couldn’t read text from this PDF/),
    });
    expect(await readRecipesFromPdf(simplePdf([['Quarterly report', 'Revenue was up.']]), deps())).toMatchObject({
      ok: false,
      reason: 'no_recipes',
    });
    expect(await readRecipesFromPdf(new TextEncoder().encode('hello'), deps())).toMatchObject({
      ok: false,
      reason: 'not_pdf',
    });
    expect(await readRecipesFromPdf(new TextEncoder().encode('%PDF-1.4 garbage'), deps())).toMatchObject({ ok: false });
  });

  it('respects the import gate and the house sweetener rule', async () => {
    expect(
      await readRecipesFromPdf(
        simplePdf([recipeB]),
        deps(() => false),
      ),
    ).toMatchObject({ ok: false, reason: 'locked' });
    const monk = ['Monk Fruit Cookies', 'Ingredients', '1 cup monk fruit sweetener', 'Steps', '1. Bake.'];
    const result = await readRecipesFromPdf(simplePdf([monk, recipeB]), deps());
    if (!result.ok) throw new Error(result.message);
    expect(result.candidates.map((c) => c.result.recipe.title)).toEqual(['Cucumber Salad']);
    expect(result.skipped[0]).toMatch(/^Monk Fruit Cookies: Contains monk fruit/);
  });

  it('splitRecipeTexts / parseRecipeText handle "1.5 cups" (not a bullet) and substitutions', () => {
    const [chunk] = splitRecipeTexts([
      'Pancakes\nIngredients\n1.5 cups almond flour\nSubstitution: coconut flour\nSteps\nMix and cook.',
    ]);
    expect(parseRecipeText(chunk)).toMatchObject({
      ingredients: [{ text: '1.5 cups almond flour', substitutionNote: 'coconut flour' }],
      steps: ['Mix and cook.'],
    });
  });
});

describe('entry points', () => {
  it('+ menu has Import PDF (needs link import) → /import-pdf', () => {
    const item = ADD_MENU_ITEMS.find((i) => i.id === 'import-pdf');
    expect(item).toMatchObject({ label: 'Import PDF', needs: ['linkImport'] });
    expect(addMenuHref('import-pdf', { today: '2026-10-04' })).toBe('/import-pdf');
  });

  it('a PDF shared to the app is recognized by its mime type', () => {
    expect(
      sharedPdfUri([{ shareType: 'file', contentUri: 'content://x/1', contentMimeType: 'application/pdf' } as never]),
    ).toBe('content://x/1');
    expect(sharedPdfUri([{ value: 'hello', mimeType: 'text/plain' }])).toBeUndefined();
  });
});
