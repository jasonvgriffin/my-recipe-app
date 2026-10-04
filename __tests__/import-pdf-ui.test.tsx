/** Import PDF screen (v1.0.6): pick → list of found recipes (checkboxes) → categories → Import N recipes. */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { imageOnlyPdf } from '../test-helpers/simple-pdf';
import { recipeStore } from '@/storage/recipes';

const fs = jest.requireActual('fs');
const mockPick = jest.fn();
const mockReadUri = jest.fn();
jest.mock('@/lib/pdf-file', () => ({
  pickPdfBytes: (...a: unknown[]) => mockPick(...a),
  readPdfUri: (...a: unknown[]) => mockReadUri(...a),
}));

const fixture = (name: string) => ({
  name: `${name}.pdf`,
  bytes: new Uint8Array(fs.readFileSync(`__tests__/fixtures/pdf/${name}.pdf`)),
});

const routes = () => ({
  _layout: require('@/app/_layout').default,
  'import-pdf': require('@/app/import-pdf').default,
  'recipe/[id]/index': require('@/app/recipe/[id]/index').default,
  recipes: require('@/app/recipes').default,
});

beforeAll(() => {
  routes();
}, 60_000);

beforeEach(async () => {
  mockPick.mockReset();
  mockReadUri.mockReset();
  for (const r of await recipeStore.list()) await recipeStore.remove(r.id);
});

describe('Import PDF screen', () => {
  it('lists every recipe in the PDF, imports the checked ones into the chosen categories', async () => {
    await recipeStore.prepareCategories();
    const dinner = (await recipeStore.listCategories()).find((c) => c.name === 'Dinner')!;
    const lunch = (await recipeStore.listCategories()).find((c) => c.name === 'Lunch')!;
    mockPick.mockResolvedValue(fixture('app-export-two'));
    renderRouter(routes(), { initialUrl: '/import-pdf' });
    await act(async () => fireEvent.press(await screen.findByTestId('import-pdf-pick')));
    const list = await screen.findByTestId('import-pdf-candidates');
    expect(within(list).getByText('Found 2 recipes')).toBeTruthy();
    expect(within(list).getByText('Lemon Herb Chicken Thighs')).toBeTruthy();
    expect(within(list).getByText('Allulose Vanilla Cheesecake Mousse')).toBeTruthy();
    expect(screen.getByTestId('import-pdf-import')).toHaveTextContent('Import 2 recipes');

    // Preview, then uncheck the mousse.
    await act(async () => fireEvent.press(screen.getByTestId('import-pdf-toggle-0')));
    expect(within(screen.getByTestId('import-pdf-preview-0')).getByText('• 2 tbsp olive oil')).toBeTruthy();
    fireEvent.press(screen.getByTestId('import-pdf-candidate-1'));
    expect(screen.getByTestId('import-pdf-import')).toHaveTextContent('Import 1 recipe');

    // Several categories (none = Uncategorized).
    expect(await screen.findByTestId('import-pdf-category-uncategorized-hint')).toBeTruthy();
    fireEvent.press(screen.getByTestId(`import-pdf-category-${lunch.id}`));
    fireEvent.press(screen.getByTestId(`import-pdf-category-${dinner.id}`));
    await act(async () => fireEvent.press(screen.getByTestId('import-pdf-import')));
    await waitFor(async () => expect(await recipeStore.list()).toHaveLength(1));
    const [saved] = await recipeStore.list();
    expect(saved).toMatchObject({
      title: 'Lemon Herb Chicken Thighs',
      categoryIds: [lunch.id, dinner.id],
      servings: 6,
    });
    // One recipe → opens it.
    await waitFor(() => expect(screen).toHavePathname(`/recipe/${saved.id}`));
  });

  it('says so when the PDF is a scan (no text)', async () => {
    mockPick.mockResolvedValue({ name: 'scan.pdf', bytes: imageOnlyPdf() });
    renderRouter(routes(), { initialUrl: '/import-pdf' });
    await act(async () => fireEvent.press(await screen.findByTestId('import-pdf-pick')));
    expect(await screen.findByTestId('import-pdf-error-no_text')).toHaveTextContent(/Couldn’t read text from this PDF/);
    expect(screen.queryByTestId('import-pdf-candidates')).toBeNull();
  });

  it('does nothing when the picker is cancelled', async () => {
    mockPick.mockResolvedValue(null);
    renderRouter(routes(), { initialUrl: '/import-pdf' });
    await act(async () => fireEvent.press(await screen.findByTestId('import-pdf-pick')));
    expect(screen.queryByTestId('import-pdf-error')).toBeNull();
    expect(screen.queryByTestId('import-pdf-candidates')).toBeNull();
  });

  it('reads a PDF shared to the app (uri param)', async () => {
    mockReadUri.mockResolvedValue(fixture('app-export-one').bytes);
    renderRouter(routes(), { initialUrl: `/import-pdf?uri=${encodeURIComponent('content://docs/recipe.pdf')}` });
    expect(await screen.findByText('Found 1 recipe')).toBeTruthy();
    expect(mockReadUri).toHaveBeenCalledWith('content://docs/recipe.pdf');
    expect(screen.getByTestId('import-pdf-file')).toHaveTextContent('recipe.pdf');
  });
});
