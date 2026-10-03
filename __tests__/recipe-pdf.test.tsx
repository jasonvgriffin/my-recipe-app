/**
 * v1.0.3 “Export PDF”: printable recipe PDF (title, photo, servings / timed steps, ingredients, steps, notes,
 * tags — never nutrition) shared through the system share sheet. Recipe detail exports one recipe; Existing
 * Recipes multi-select (and Recipes-tab “Share Recipes” / + menu “Share Recipe”, which open it) exports several
 * into one PDF. Household sharing stays reachable from More → Household. Gate: `pdfExport` (requires `share`).
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { featureGate, LocalFreeEntitlements, NoEntitlements, canUse, type FeatureId } from '@/entitlements';
import { createRecipe } from '@/lib/recipe-utils';
import { buildRecipesPdfHtml, escapeHtml, pdfFileName, totalStepSeconds } from '@/lib/recipe-pdf';
import { recipeStore } from '@/storage/recipes';
import type { Recipe } from '@/types/recipe';

const mockFiles = new Map<string, string>(); // uri -> base64 content
jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() {
      return true;
    }
    create() {}
  }
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
    async base64() {
      return mockFiles.get(this.uri) ?? '';
    }
    async move(dest: { uri: string }) {
      mockFiles.set(dest.uri, mockFiles.get(this.uri) ?? '');
      mockFiles.delete(this.uri);
      this.uri = dest.uri;
    }
  }
  return { File, Directory, Paths: { cache: new Directory('file:///cache'), document: new Directory('file:///docs') } };
});

jest.mock('@/lib/present-share', () => ({ presentShare: jest.fn(async () => {}) }));

const Print = jest.requireMock('expo-print') as { printToFileAsync: jest.Mock };
const { presentShare } = jest.requireMock('@/lib/present-share') as { presentShare: jest.Mock };

const premium = (...ids: FeatureId[]) =>
  Object.fromEntries(ids.map((id) => [id, { tier: 'premium' as const }])) as Parameters<
    typeof featureGate.setConfig
  >[0];

function soup(overrides: Partial<Recipe> = {}): Recipe {
  return {
    ...createRecipe({
      title: 'Chicken <Soup> & Greens',
      servings: 4,
      tags: ['soup', 'low-sugar'],
      ingredients: [
        { text: '2 cups chicken broth' },
        { text: '1 tbsp allulose', substitutionNote: 'allulose instead of sugar' },
      ],
      steps: [{ text: 'Simmer the broth.', durationSeconds: 1200 }, { text: 'Stir in greens.' }],
      notes: 'Freezes well.',
      sourceUrl: 'https://example.com/soup',
    }),
    ...overrides,
  };
}

beforeEach(async () => {
  await require('@react-native-async-storage/async-storage').clear();
  mockFiles.clear();
  mockFiles.set('file:///cache/Print/abc.pdf', 'JVBERi0=');
  Print.printToFileAsync.mockClear();
  presentShare.mockClear();
});

afterEach(() => {
  act(() => {
    featureGate.resetConfig();
    featureGate.setProvider(new LocalFreeEntitlements());
  });
});

describe('recipe PDF HTML (pure)', () => {
  it('has the title, servings, timed steps, ingredients, steps, notes, tags and source — escaped', () => {
    const html = buildRecipesPdfHtml([soup()]);
    expect(html).toContain('<h1>Chicken &lt;Soup&gt; &amp; Greens</h1>');
    expect(html).toContain('Servings: 4');
    expect(html).toContain('Timed steps: 20 min');
    expect(html).toMatch(/<li>2 cups? chicken broth<\/li>/); // same wording as the detail screen
    expect(html).toContain('Substitution: allulose instead of sugar');
    expect(html).toMatch(/<li>Simmer the broth\. <span class="timer">\(20 min\)<\/span><\/li>/);
    expect(html).toContain('<li>Stir in greens.</li>');
    expect(html).toContain('Freezes well.');
    expect(html).toContain('soup, low-sugar');
    expect(html).toContain('Source: https://example.com/soup');
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/<Soup>/);
  });

  it('never includes nutrition', () => {
    const html = buildRecipesPdfHtml([soup()]).toLowerCase();
    expect(html).not.toMatch(/nutrition|calorie|kcal|carb|protein|macro|sugar alcohol|fat\b/);
  });

  it('adds the photo when given, and one page per recipe for several', () => {
    const html = buildRecipesPdfHtml([soup(), soup({ title: 'Eggs', notes: undefined, tags: [] })], {
      photoSrc: (_r, i) => (i === 0 ? 'data:image/jpeg;base64,AAA' : undefined),
    });
    expect(html.match(/<section class="recipe">/g)).toHaveLength(2);
    expect(html.match(/<img /g)).toHaveLength(1);
    expect(html).toContain('src="data:image/jpeg;base64,AAA"');
    expect(html).toContain('<title>2 recipes</title>');
    expect(html).toContain('page-break-after: always');
  });

  it('helpers', () => {
    expect(escapeHtml(`a<b>"c"&'d'`)).toBe('a&lt;b&gt;&quot;c&quot;&amp;&#39;d&#39;');
    expect(totalStepSeconds({ steps: [{ text: 'x' }] })).toBeUndefined();
    expect(pdfFileName([{ title: 'Soup / Stew: "Best"?' }])).toBe('Soup Stew Best .pdf'.replace(' .pdf', '.pdf'));
    expect(pdfFileName([{ title: 'A' }, { title: 'B' }, { title: 'C' }])).toBe('My Recipes (3).pdf');
    expect(pdfFileName([{ title: '   ' }])).toBe('Recipe.pdf');
  });
});

describe('exportRecipesPdf', () => {
  const { exportRecipesPdf } = require('@/lib/export-pdf') as typeof import('@/lib/export-pdf');

  it('prints the HTML, names the file after the recipe, and opens the share sheet with a PDF', async () => {
    mockFiles.set('file:///docs/recipe-photos/r1.jpg', 'PHOTO64');
    await exportRecipesPdf([soup({ title: 'Chicken Soup', photoUri: 'file:///docs/recipe-photos/r1.jpg' })]);
    const { html } = Print.printToFileAsync.mock.calls[0][0];
    expect(html).toContain('Chicken Soup');
    expect(html).toContain('src="data:image/jpeg;base64,PHOTO64"');
    expect(presentShare).toHaveBeenCalledWith({
      title: 'Chicken Soup',
      fileUri: 'file:///cache/recipe-pdfs/Chicken Soup.pdf',
      mimeType: 'application/pdf',
    });
  });

  it('several recipes → one PDF; a missing photo is skipped; photos off → no photo', async () => {
    featureGate.setProvider(new NoEntitlements());
    featureGate.setConfig(premium('photos'));
    await exportRecipesPdf([soup({ photoUri: 'file:///missing.jpg' }), soup({ title: 'Eggs' })]);
    const { html } = Print.printToFileAsync.mock.calls[0][0];
    expect(html).not.toContain('<img');
    expect(presentShare.mock.calls[0][0]).toMatchObject({ title: '2 recipes', mimeType: 'application/pdf' });
    expect(presentShare.mock.calls[0][0].fileUri).toMatch(/My Recipes \(2\)\.pdf$/);
  });

  it('is gated by pdfExport (and needs share)', async () => {
    featureGate.setProvider(new NoEntitlements());
    featureGate.setConfig(premium('share'));
    expect(canUse('pdfExport')).toBe(false); // requires share
    await expect(exportRecipesPdf([soup()])).rejects.toThrow('PDF export is not available.');
    expect(Print.printToFileAsync).not.toHaveBeenCalled();
  });
});

const routes = () => ({
  _layout: require('@/app/_layout').default,
  '(tabs)/_layout': require('@/app/(tabs)/_layout').default,
  '(tabs)/index': require('@/app/(tabs)/index').default,
  '(tabs)/more': require('@/app/(tabs)/more').default,
  '(tabs)/add-menu': require('@/app/(tabs)/add-menu').default,
  recipes: require('@/app/recipes').default,
  'recipe/[id]': require('@/app/recipe/[id]').default,
  household: require('@/app/household').default,
  settings: require('@/app/settings').default,
});

describe('UI', () => {
  beforeAll(() => {
    routes();
  }, 60_000);

  it('recipe detail: Export PDF shares that recipe', async () => {
    const r = await recipeStore.save(soup({ title: 'Chicken Soup' }));
    renderRouter(routes(), { initialUrl: `/recipe/${r.id}` });
    const button = await screen.findByTestId('export-pdf-button');
    await act(async () => fireEvent.press(button));
    await waitFor(() => expect(presentShare).toHaveBeenCalledTimes(1));
    expect(Print.printToFileAsync.mock.calls[0][0].html).toContain('Chicken Soup');
  });

  it('+ menu “Share Recipes” → pick several → Share PDF makes one PDF', async () => {
    const a = await recipeStore.save(soup({ title: 'Alpha Soup' }));
    await recipeStore.save(soup({ title: 'Beta Stew' }));
    const c = await recipeStore.save(soup({ title: 'Gamma Eggs' }));
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('search-input');
    await act(async () => fireEvent.press(screen.getByTestId('tab-add-button')));
    await act(async () => fireEvent.press(screen.getByTestId('add-menu-share-recipe')));
    await waitFor(() => expect(screen).toHavePathname('/recipes'));
    expect(await screen.findByTestId('pdf-select-bar')).toBeTruthy();
    expect(screen.getByTestId('pdf-share-button')).toBeDisabled();
    await act(async () => fireEvent.press(screen.getByTestId(`recipe-item-${a.id}`)));
    await act(async () => fireEvent.press(screen.getByTestId(`recipe-item-${c.id}`)));
    expect(screen).toHavePathname('/recipes'); // picking doesn't open the recipe
    expect(screen.getByTestId('pdf-share-button')).toHaveTextContent('Share PDF (2)');
    await act(async () => fireEvent.press(screen.getByTestId('pdf-share-button')));
    await waitFor(() => expect(presentShare).toHaveBeenCalledTimes(1));
    const { html } = Print.printToFileAsync.mock.calls[0][0];
    expect(html).toContain('Alpha Soup');
    expect(html).toContain('Gamma Eggs');
    expect(html).not.toContain('Beta Stew');
  });

  it('Existing Recipes: “Select recipes for PDF”, All, Cancel', async () => {
    await recipeStore.save(soup({ title: 'Alpha Soup' }));
    await recipeStore.save(soup({ title: 'Beta Stew' }));
    renderRouter(routes(), { initialUrl: '/recipes' });
    expect(screen.queryByTestId('pdf-select-bar')).toBeNull();
    const select = await screen.findByTestId('pdf-select-button');
    await act(async () => fireEvent.press(select));
    await act(async () => fireEvent.press(screen.getByTestId('pdf-select-all')));
    expect(screen.getByTestId('pdf-share-button')).toHaveTextContent('Share PDF (2)');
    await act(async () => fireEvent.press(screen.getByTestId('pdf-select-cancel')));
    expect(screen.queryByTestId('pdf-select-bar')).toBeNull();
    expect(screen.getByTestId('list-add-recipe-button')).toBeTruthy();
  });

  it('+ menu “Share Recipes” opens the PDF picker; household sharing stays under More', async () => {
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('search-input');
    await act(async () => fireEvent.press(screen.getByTestId('tab-add-button')));
    await act(async () => fireEvent.press(screen.getByTestId('add-menu-share-recipe')));
    await waitFor(() => expect(screen).toHavePathname('/recipes'));
    screen.unmount();
    renderRouter(routes(), { initialUrl: '/more' });
    const household = await screen.findByTestId('more-household');
    await act(async () => fireEvent.press(household));
    await waitFor(() => expect(screen).toHavePathname('/household'));
  });

  it('locked pdfExport: no Export PDF, no Share Recipes, no picker; Share and recipes still work', async () => {
    featureGate.setProvider(new NoEntitlements());
    featureGate.setConfig(premium('pdfExport'));
    const r = await recipeStore.save(soup({ title: 'Chicken Soup' }));
    renderRouter(routes(), { initialUrl: `/recipe/${r.id}` });
    expect(await screen.findByTestId('share-recipe-button')).toBeTruthy();
    expect(screen.queryByTestId('export-pdf-button')).toBeNull();
    screen.unmount();
    renderRouter(routes(), { initialUrl: '/' });
    await screen.findByTestId('search-input');
    await act(async () => fireEvent.press(screen.getByTestId('tab-add-button')));
    expect(screen.queryByTestId('add-menu-share-recipe')).toBeNull();
    expect(screen.getByTestId('add-menu-add-recipe')).toBeTruthy();
    screen.unmount();
    renderRouter(routes(), { initialUrl: '/recipes?select=pdf' });
    expect(await screen.findByTestId(`recipe-item-${r.id}`)).toBeTruthy();
    expect(screen.queryByTestId('pdf-select-bar')).toBeNull();
    expect(screen.queryByTestId('pdf-share-button')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId(`recipe-item-${r.id}`)));
    expect(await screen.findByTestId('recipe-detail')).toBeTruthy(); // opens the recipe (route or side pane)
  });
});
